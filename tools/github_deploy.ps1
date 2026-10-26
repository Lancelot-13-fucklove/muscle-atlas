# github_deploy.ps1 — 用 GitHub REST API 把 muscle-atlas 发布成 GitHub Pages 站点（PowerShell 版，无需本地 git）
#
# 为什么用 curl.exe：本机 Python/OpenSSL 到 api.github.com 的 TLS 握手会被中途断开，
# 而 Windows 自带的 curl.exe（Schannel）加 --ssl-no-revoke 可以正常访问。
#
# 用法：
#   $env:GH_TOKEN = 'ghp_xxx'
#   powershell -ExecutionPolicy Bypass -File tools\github_deploy.ps1 -Repo muscle-atlas
#
# 可选参数：
#   -Owner <用户名>   默认用 token 对应账号
#   -Branch main      发布分支
#   -Private          私有仓库（Pages 需付费账号）
#   -DryRun           只列出将上传的文件
#   -SkipPages        只推文件，不开 Pages

[CmdletBinding()]
param(
    [string]$Repo = 'muscle-atlas',
    [string]$Owner = '',
    [string]$Branch = 'main',
    [switch]$Private,
    [switch]$DryRun,
    [switch]$SkipPages
)

$ErrorActionPreference = 'Stop'
$script:token = $env:GH_TOKEN
if (-not $script:token) { $script:token = $env:GITHUB_TOKEN }
$script:ua = 'muscle-atlas-deploy/1.0'
$curl = Join-Path $env:SystemRoot 'System32\curl.exe'
if (-not (Test-Path $curl)) { throw '找不到 curl.exe' }

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'index.html'))) { throw '请在 muscle-atlas 项目内运行本脚本' }

function Write-Log([string]$msg) {
    Write-Host ('[deploy] ' + $msg)
}

# 上传清单
$includeDirs = @('src', 'vendor', 'docs', 'tools', 'shots', 'tools/deploy-templates')
$includeFiles = @('index.html', 'styles.css', 'README.md', '打开.cmd', '.gitignore')
$skipDirs = @('deploy', '__pycache__', 'node_modules', '.git')
$shotAllowPrefix = 'screenshot-'
$shotAllowNames = @('selftest.png', 'deploy-preview.png')

function Get-DeployFiles {
    $list = New-Object System.Collections.ArrayList
    $seen = @{}
    function Add-One([string]$rel) {
        $full = Join-Path $root $rel
        if ((Test-Path -LiteralPath $full -PathType Leaf) -and -not $seen.ContainsKey($rel)) {
            $script:seen[$rel] = $true
            [void]$script:list.Add([pscustomobject]@{ Rel = $rel.Replace('\', '/'); Full = $full; Size = (Get-Item -LiteralPath $full).Length })
        }
    }
    $script:list = $list
    $script:seen = $seen
    foreach ($rel in $includeFiles) { Add-One $rel }
    foreach ($d in $includeDirs) {
        $base = Join-Path $root $d
        if (-not (Test-Path -LiteralPath $base -PathType Container)) { continue }
        Get-ChildItem -LiteralPath $base -Recurse -File -Force | ForEach-Object {
            $rel = $_.FullName.Substring($root.Length + 1)
            $parts = $rel.Split('\')
            $skip = $false
            foreach ($p in $parts) { if ($skipDirs -contains $p) { $skip = $true } }
            if ($skip) { return }
            if ($parts[0] -eq 'shots') {
                if (-not ($_.Name.StartsWith($shotAllowPrefix) -or ($shotAllowNames -contains $_.Name))) { return }
            }
            Add-One $rel
        }
    }
    return ($script:list | Sort-Object -Property Rel)
}

function Invoke-Curl {
    param(
        [string]$Method = 'GET',
        [string]$Path,
        [string]$BodyFile = '',
        [int[]]$OkCodes = @(200, 201, 204, 404, 409, 422),
        [int]$Retries = 3
    )
    $url = 'https://api.github.com' + $Path
    $lastText = ''
    for ($attempt = 1; $attempt -le $Retries; $attempt++) {
        $curlArgs = @(
            '-sS', '--ssl-no-revoke', '-m', '180', '-X', $Method,
            '-H', ('Authorization: Bearer ' + $script:token),
            '-H', 'Accept: application/vnd.github+json',
            '-H', 'X-GitHub-Api-Version: 2022-11-28',
            '-H', ('User-Agent: ' + $script:ua),
            '-w', "`n__STATUS__%{http_code}"
        )
        if ($BodyFile) {
            $curlArgs += @('-H', 'Content-Type: application/json; charset=utf-8', '--data-binary', ('@' + $BodyFile))
        }
        $curlArgs += $url
        $raw = & $curl @curlArgs 2>&1
        $text = ($raw | Out-String)
        $lastText = $text
        $sep = $text.LastIndexOf('__STATUS__')
        if ($sep -lt 0) {
            if ($attempt -lt $Retries) { Start-Sleep -Seconds (2 * $attempt); continue }
            throw ("curl 无响应: {0} {1}" -f $Method, $Path)
        }
        $bodyText = $text.Substring(0, $sep).Trim()
        $code = 0
        [void][int]::TryParse($text.Substring($sep + 10).Trim(), [ref]$code)
        if ($code -eq 0) {
            if ($attempt -lt $Retries) { Start-Sleep -Seconds (2 * $attempt); continue }
            throw ("curl 网络失败: {0} {1}" -f $Method, $Path)
        }
        $obj = $null
        if ($bodyText) {
            try { $obj = $bodyText | ConvertFrom-Json } catch { $obj = @{ raw = $bodyText } }
        }
        if ($OkCodes -contains $code) {
            return [pscustomobject]@{ Code = $code; Body = $obj }
        }
        $msg = ''
        if ($obj -and $obj.message) { $msg = $obj.message }
        if ($code -ge 500 -and $attempt -lt $Retries) { Start-Sleep -Seconds (2 * $attempt); continue }
        throw ("GitHub API {0} {1} -> HTTP {2}: {3}" -f $Method, $Path, $code, $msg)
    }
    throw ("请求失败: {0} {1}`n{2}" -f $Method, $Path, $lastText)
}

function Save-Json([object]$obj, [string]$path) {
    $json = $obj | ConvertTo-Json -Depth 12 -Compress
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $json, $enc)
}

# ---------- 0. 收集文件 ----------
$files = Get-DeployFiles
$totalBytes = ($files | Measure-Object -Property Size -Sum).Sum
Write-Log ("待上传 {0} 个文件，共 {1:N1} KB" -f $files.Count, ($totalBytes / 1024.0))
if ($DryRun) {
    foreach ($f in $files) { Write-Log ("  {0,8}  {1}" -f $f.Size, $f.Rel) }
    return
}
if (-not $script:token) { throw '缺少 GH_TOKEN 环境变量（GitHub Settings -> Developer settings -> Tokens (classic)，勾 repo）' }

$payload = Join-Path $env:TEMP ('gh_deploy_payload_{0}.json' -f $PID)

# ---------- 1. 身份 ----------
$r = Invoke-Curl -Path '/user' -OkCodes @(200, 401, 403)
if ($r.Code -ne 200) { throw ('token 无效或权限不足: HTTP ' + $r.Code) }
$login = $r.Body.login
if (-not $Owner) { $Owner = $login }
if ($Owner.ToLower() -ne $login.ToLower()) { throw ("token 属于 {0}，与 -Owner {1} 不一致" -f $login, $Owner) }
Write-Log ("账号: {0}  仓库: {1}  (public={2})" -f $Owner, $Repo, (-not $Private))

# ---------- 2. 仓库 ----------
$repoBody = @{
    name        = $Repo
    description = '交互式男性全身肌肉 3D 图谱：25 块肌肉 · 86 个训练动作（three.js，离线可用）'
    private     = [bool]$Private
    auto_init   = $false
    has_wiki    = $false
    has_projects = $false
}
Save-Json $repoBody $payload
$r = Invoke-Curl -Method POST -Path '/user/repos' -BodyFile $payload -OkCodes @(201, 422)
$repoUrl = ''
if ($r.Code -eq 201) {
    $repoUrl = $r.Body.html_url
    Write-Log ('仓库已创建: ' + $repoUrl)
} else {
    Write-Log '仓库已存在，读取现有信息…'
    $r = Invoke-Curl -Path ('/repos/{0}/{1}' -f $Owner, $Repo) -OkCodes @(200)
    $repoUrl = $r.Body.html_url
}
$repoInfo = Invoke-Curl -Path ('/repos/{0}/{1}' -f $Owner, $Repo) -OkCodes @(200)
if ($repoInfo.Body.default_branch) { $Branch = $repoInfo.Body.default_branch }

# 空仓库没有 ref，Git Data API 会返回 409 "Git Repository is empty"
# 先用 Contents API 建一个初始提交，之后 blob/tree/commit 才能工作
$refCheck = Invoke-Curl -Path ('/repos/{0}/{1}/git/ref/heads/{2}' -f $Owner, $Repo, $Branch) -OkCodes @(200, 404, 409)
if ($refCheck.Code -ne 200) {
    Write-Log ('仓库为空，先用 Contents API 初始化分支 {0} …' -f $Branch)
    $initText = "# muscle-atlas`n`n交互式男性全身肌肉 3D 训练图谱（three.js，离线可用）。`n"
    Save-Json @{ message = 'chore: init repository'; content = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($initText)) } $payload
    [void](Invoke-Curl -Method PUT -Path ('/repos/{0}/{1}/contents/README.md' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(200, 201))
}

# ---------- 3. 上传 blob ----------
$tree = New-Object System.Collections.ArrayList
$i = 0
foreach ($f in $files) {
    $i++
    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.Full))
    Save-Json @{ content = $b64; encoding = 'base64' } $payload
    $r = Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/git/blobs' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201)
    [void]$tree.Add([pscustomobject]@{ path = $f.Rel; mode = '100644'; type = 'blob'; sha = $r.Body.sha })
    if (($i % 8) -eq 0 -or $i -eq $files.Count) { Write-Log ("  已上传 {0}/{1}" -f $i, $files.Count) }
}
# .nojekyll（空文件）
Save-Json @{ content = ''; encoding = 'base64' } $payload
$r = Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/git/blobs' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201)
[void]$tree.Add([pscustomobject]@{ path = '.nojekyll'; mode = '100644'; type = 'blob'; sha = $r.Body.sha })

# ---------- 4. tree / commit / ref ----------
$baseTree = $null
$parent = $null
$r = Invoke-Curl -Path ('/repos/{0}/{1}/git/ref/heads/{2}' -f $Owner, $Repo, $Branch) -OkCodes @(200, 404, 409)
if ($r.Code -eq 200 -and $r.Body.object.sha) {
    $parent = $r.Body.object.sha
    $c = Invoke-Curl -Path ('/repos/{0}/{1}/git/commits/{2}' -f $Owner, $Repo, $parent) -OkCodes @(200)
    $baseTree = $c.Body.tree.sha
    Write-Log ("基于已有分支 {0}（parent={1}）更新" -f $Branch, $parent.Substring(0, 7))
} else {
    Write-Log '仓库为空，创建首个提交'
}

$treeBody = @{ tree = @($tree) }
if ($baseTree) { $treeBody.base_tree = $baseTree }
Save-Json $treeBody $payload
$r = Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/git/trees' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201)
$treeSha = $r.Body.sha

$commitBody = @{
    message = ('chore: 部署肌肉训练图谱到 GitHub Pages ({0})' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'))
    tree    = $treeSha
}
if ($parent) { $commitBody.parents = @($parent) }
Save-Json $commitBody $payload
$r = Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/git/commits' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201)
$commitSha = $r.Body.sha

if ($parent) {
    Save-Json @{ sha = $commitSha; force = $false } $payload
    [void](Invoke-Curl -Method PATCH -Path ('/repos/{0}/{1}/git/refs/heads/{2}' -f $Owner, $Repo, $Branch) -BodyFile $payload -OkCodes @(200))
    Write-Log ("分支 {0} 已更新 -> {1}" -f $Branch, $commitSha.Substring(0, 7))
} else {
    Save-Json @{ ref = ('refs/heads/' + $Branch); sha = $commitSha } $payload
    [void](Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/git/refs' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201))
    Write-Log ("分支 {0} 已创建 -> {1}" -f $Branch, $commitSha.Substring(0, 7))
}

$htmlUrl = 'https://{0}.github.io/{1}/' -f $Owner.ToLower(), $Repo
if ($SkipPages) {
    Write-Log ('已跳过 Pages。仓库地址: ' + $repoUrl)
    return
}

# ---------- 5. 开启 Pages ----------
Write-Log ("开启 GitHub Pages（{0} -> /）…" -f $Branch)
Start-Sleep -Seconds 3
Save-Json @{ source = @{ branch = $Branch; path = '/' } } $payload
$r = Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/pages' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201, 409, 422)
if ($r.Code -eq 422) {
    Save-Json @{ build_type = 'legacy'; source = @{ branch = $Branch; path = '/' } } $payload
    $r = Invoke-Curl -Method POST -Path ('/repos/{0}/{1}/pages' -f $Owner, $Repo) -BodyFile $payload -OkCodes @(201, 409, 422)
}
if ($r.Code -eq 409) { Write-Log 'Pages 已开启，继续等待构建' }

# ---------- 6. 轮询站点 ----------
Write-Log '等待 Pages 构建（首次通常 30~90 秒）…'
$deadline = (Get-Date).AddSeconds(360)
$ok = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 10
    $curlArgs = @('-sS', '--ssl-no-revoke', '-m', '25', '-o', 'NUL', '-w', '%{http_code}', '-H', ('User-Agent: ' + $script:ua), $htmlUrl)
    $code = (& $curl $curlArgs 2>$null | Out-String).Trim()
    if ($code -eq '200') {
        $probe = & $curl -sS --ssl-no-revoke -m 25 -H ('User-Agent: ' + $script:ua) $htmlUrl 2>$null
        $pageText = ($probe | Out-String)
        if ($pageText -match '肌肉|muscle') {
            $ok = $true
            Write-Log '  站点已可访问 (HTTP 200)'
            break
        }
        Write-Log '  返回 200，但内容可能还是占位页，继续等待…'
    } else {
        Write-Log ("  等待中… HTTP {0}" -f $code)
    }
}

Write-Host ''
Write-Host '========== 部署完成 =========='
Write-Host ('仓库:   ' + $repoUrl)
Write-Host ('站点:   ' + $htmlUrl)
Write-Host ('深链接: ' + $htmlUrl + '#m=pectoralis-major')
if (-not $ok) { Write-Host '注意：站点尚未返回预期内容，可能仍在构建，请 1 分钟后刷新。' }
