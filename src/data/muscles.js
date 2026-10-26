/* ============================================================================
 * 肌肉元数据 — 男性全身肌肉训练图谱
 * 经典浏览器脚本（非 ES module），挂载到 window.MUSCLE_ATLAS
 *
 * 字段说明：
 *   id        与 src/data/exercises.js 的键、body.js 的 userData.muscleId 严格一致
 *   name      中文名
 *   nameEn    英文名
 *   latin     拉丁文名
 *   pinyin    拼音（用于搜索）
 *   group     分组 id，见文件末尾 MUSCLE_ATLAS.groups
 *   color     模型肌肉着色（解剖学肌肉红，避免过饱和）
 *   views     该肌肉最容易观察的视角（front / back / left / right），
 *             点击选中后引擎会自动转至该视角
 *   summary   功能简介（1-2 句）
 *   origin    起点
 *   insertion 止点
 *   duties    主要功能，3 条
 *   training  训练要点摘要（详情面板中的导语）
 *
 * 编码：UTF-8（无 BOM）。index.html 必须声明 <meta charset="utf-8">。
 * ========================================================================== */
(function (root) {
  'use strict';

  var A = root.MUSCLE_ATLAS || (root.MUSCLE_ATLAS = {});

  /* 分组顺序即左侧列表顺序 */
  var groups = [
    { id: 'chest',   name: '胸部', order: 1 },
    { id: 'back',    name: '背部', order: 2 },
    { id: 'shoulder',name: '肩部', order: 3 },
    { id: 'arms',    name: '手臂', order: 4 },
    { id: 'core',    name: '核心', order: 5 },
    { id: 'glutes',  name: '臀部', order: 6 },
    { id: 'legs',    name: '腿部', order: 7 },
    { id: 'neck',    name: '颈部', order: 8 }
  ];

  var muscles = [
    {
      id: 'pectoralis-major',
      name: '胸大肌',
      nameEn: 'Pectoralis Major',
      latin: 'Musculus pectoralis major',
      pinyin: 'xiong da ji',
      group: 'chest',
      color: '#c33d2b',
      views: ['front'],
      summary: '覆盖胸廓前上部的扇形大肌，是上肢推类动作最主要的发力肌群。',
      origin: '锁骨内侧半、胸骨前面、第 1-6 肋软骨、腹外斜肌腱膜',
      insertion: '肱骨大结节嵴（结节间沟外侧唇）',
      duties: ['上臂内收与内旋', '上臂水平屈曲（向前合抱）', '上提躯干（引体、攀爬时辅助）'],
      training: '以水平推为主（卧推），再配合上斜推与夹胸补足上束和内侧；肩胛骨全程后缩下沉，避免耸肩。'
    },
    {
      id: 'deltoid-anterior',
      name: '三角肌前束',
      nameEn: 'Anterior Deltoid',
      latin: 'Musculus deltoideus, pars clavicularis',
      pinyin: 'san jiao ji qian shu',
      group: 'shoulder',
      color: '#cf4a2f',
      views: ['front'],
      summary: '三角肌靠前的一束，与胸大肌上束共同完成肩部前举和推举。',
      origin: '锁骨外侧 1/3 前缘',
      insertion: '肱骨三角肌粗隆',
      duties: ['肩关节屈曲（前举）', '肩关节内旋', '肩关节水平内收'],
      training: '肩推举为主，辅以前平举；注意后束与中束的平衡，避免只练前束造成圆肩。'
    },
    {
      id: 'deltoid-lateral',
      name: '三角肌中束',
      nameEn: 'Lateral Deltoid',
      latin: 'Musculus deltoideus, pars acromialis',
      pinyin: 'san jiao ji zhong shu',
      group: 'shoulder',
      color: '#d9553a',
      views: ['front', 'left', 'right'],
      summary: '决定肩宽观感的外侧肌束，是肩关节外展的主力。',
      origin: '肩峰外侧缘',
      insertion: '肱骨三角肌粗隆',
      duties: ['肩关节外展（侧平举）', '稳定肩关节于体侧', '与前束协同完成前外侧举'],
      training: '侧平举是核心动作，采用能全程控制的重量；肘部微屈、小拇指不得高于大拇指，避免肩峰撞击。'
    },
    {
      id: 'deltoid-posterior',
      name: '三角肌后束',
      nameEn: 'Posterior Deltoid',
      latin: 'Musculus deltoideus, pars spinalis',
      pinyin: 'san jiao ji hou shu',
      group: 'shoulder',
      color: '#b8382a',
      views: ['back'],
      summary: '肩部后侧肌束，负责把上臂向后、向外拉，是改善体态的关键。',
      origin: '肩胛冈下缘',
      insertion: '肱骨三角肌粗隆',
      duties: ['肩关节后伸', '肩关节水平外展', '肩关节外旋（协同冈下肌）'],
      training: '反向飞鸟、面拉、俯身划船为主；重量宜轻，感受后束收缩，不要用斜方肌代偿。'
    },
    {
      id: 'trapezius',
      name: '斜方肌',
      nameEn: 'Trapezius',
      latin: 'Musculus trapezius',
      pinyin: 'xie fang ji',
      group: 'back',
      color: '#a8342a',
      views: ['back'],
      summary: '覆盖颈后与上背的巨型菱形肌，分上、中、下三束控制肩胛骨的运动。',
      origin: '枕外隆凸、项韧带、第 7 颈椎至第 12 胸椎棘突',
      insertion: '锁骨外侧 1/3、肩峰、肩胛冈',
      duties: ['上提、后缩、下压肩胛骨', '协助头部后仰与侧屈', '维持颈胸段直立姿势'],
      training: '耸肩练上束、面拉与坐姿划船练中束、伏地 Y 字举练下束；久坐人群应加强中下束。'
    },
    {
      id: 'latissimus-dorsi',
      name: '背阔肌',
      nameEn: 'Latissimus Dorsi',
      latin: 'Musculus latissimus dorsi',
      pinyin: 'bei kuo ji',
      group: 'back',
      color: '#9c4030',
      views: ['back'],
      summary: '覆盖中下背最宽大的扁肌，构成背部 V 形轮廓，是下拉与划船的主力。',
      origin: '第 7-12 胸椎棘突、胸腰筋膜、髂嵴后部、第 9-12 肋',
      insertion: '肱骨小结节嵴（结节间沟内侧唇）',
      duties: ['肩关节内收（把上臂拉向躯干）', '肩关节后伸', '肩关节内旋'],
      training: '引体向上、高位下拉、单臂划船覆盖不同角度；先沉肩再发力，避免用手臂代偿。'
    },
    {
      id: 'erector-spinae',
      name: '竖脊肌',
      nameEn: 'Erector Spinae',
      latin: 'Musculi erector spinae',
      pinyin: 'shu ji ji',
      group: 'back',
      color: '#8e3b30',
      views: ['back'],
      summary: '沿脊柱两侧纵行的强大肌柱，从骶骨一直延伸到颅底，维持直立与稳定。',
      origin: '骶骨后面、髂嵴后部、腰椎棘突与骶结节韧带',
      insertion: '肋骨、椎骨横突与棘突，最上束止于颞骨乳突',
      duties: ['伸展脊柱（挺直腰背）', '单侧收缩时侧屈脊柱', '离心控制前屈、保护腰椎'],
      training: '硬拉、罗马椅挺身、鸟狗式；重点在脊柱中立位下的等长稳定与离心控制，不要过度后仰。'
    },
    {
      id: 'infraspinatus',
      name: '冈下肌',
      nameEn: 'Infraspinatus',
      latin: 'Musculus infraspinatus',
      pinyin: 'gang xia ji',
      group: 'back',
      color: '#a8452f',
      views: ['back'],
      summary: '肩袖四肌之一，覆盖肩胛冈下方，是肩关节外旋最重要的稳定器。',
      origin: '肩胛冈下窝',
      insertion: '肱骨大结节中面',
      duties: ['肩关节外旋', '把肱骨头压向肩胛盂，防止上移', '协同三角肌后束稳定肩关节'],
      training: '弹力带或绳索外旋、侧卧外旋、面拉末端外旋；小重量多次数，动作幅度小但控制要稳。'
    },
    {
      id: 'biceps-brachii',
      name: '肱二头肌',
      nameEn: 'Biceps Brachii',
      latin: 'Musculus biceps brachii',
      pinyin: 'gong er tou ji',
      group: 'arms',
      color: '#c9432c',
      views: ['front'],
      summary: '上臂前侧的双头肌，既是屈肘主力，也是前臂旋后的强力肌。',
      origin: '长头起于肩胛骨盂上结节，短头起于肩胛骨喙突',
      insertion: '桡骨粗隆及前臂筋膜',
      duties: ['屈曲肘关节', '前臂旋后（掌心向上翻转）', '协助肩关节屈曲与稳定'],
      training: '弯举时固定大臂、全程控制离心；窄握更偏长头、宽握更偏短头，旋后握法能强化收缩。'
    },
    {
      id: 'triceps-brachii',
      name: '肱三头肌',
      nameEn: 'Triceps Brachii',
      latin: 'Musculus triceps brachii',
      pinyin: 'gong san tou ji',
      group: 'arms',
      color: '#b03a2a',
      views: ['back'],
      summary: '上臂后侧的三头肌，占上臂围度约三分之二，是伸肘唯一主力。',
      origin: '长头起于盂下结节，外侧头与内侧头起于肱骨后面',
      insertion: '尺骨鹰嘴及前臂筋膜',
      duties: ['伸展肘关节', '长头协助肩关节后伸与内收', '稳定肘关节'],
      training: '窄距卧推、双杠臂屈伸、绳索下压、过头臂屈伸；长头在过头位拉伸更充分，下压时肘部固定不外张。'
    },
    {
      id: 'forearm-flexors',
      name: '前臂屈肌群',
      nameEn: 'Forearm Flexors',
      latin: 'Musculi flexores antebrachii',
      pinyin: 'qian bi qu ji qun',
      group: 'arms',
      color: '#c74b33',
      views: ['front'],
      summary: '前臂掌侧一组肌肉，控制屈腕、屈指与握力，是引体、硬拉握持的基础。',
      origin: '肱骨内上髁、尺桡骨前面及骨间膜',
      insertion: '腕骨、掌骨与指骨掌侧',
      duties: ['屈曲腕关节', '屈曲手指、提供握力', '前臂旋前（旋前圆肌）'],
      training: '腕弯举、农夫行走、悬垂握力训练；握力不足常限制背部训练重量，应单独安排。'
    },
    {
      id: 'forearm-extensors',
      name: '前臂伸肌群',
      nameEn: 'Forearm Extensors',
      latin: 'Musculi extensores antebrachii',
      pinyin: 'qian bi shen ji qun',
      group: 'arms',
      color: '#b8482f',
      views: ['back'],
      summary: '前臂背侧一组肌肉，负责伸腕伸指，也是网球肘的高发部位。',
      origin: '肱骨外上髁、尺桡骨后面及骨间膜',
      insertion: '掌骨与指骨背侧',
      duties: ['伸展腕关节', '伸展手指、张开手掌', '稳定腕关节于发力位置'],
      training: '反向腕弯举、伸指弹力带、正握弯举；训练前后注意前臂放松与拉伸。'
    },
    {
      id: 'rectus-abdominis',
      name: '腹直肌',
      nameEn: 'Rectus Abdominis',
      latin: 'Musculus rectus abdominis',
      pinyin: 'fu zhi ji',
      group: 'core',
      color: '#cf4a33',
      views: ['front'],
      summary: '腹前壁正中纵行的带状肌，被腱划分成数块，负责屈曲躯干与稳定核心。',
      origin: '耻骨联合、耻骨嵴',
      insertion: '第 5-7 肋软骨及胸骨剑突',
      duties: ['屈曲脊柱（卷腹、抬腿）', '维持腹压、稳定躯干', '控制骨盆后倾'],
      training: '卷腹、悬垂举腿、平板支撑交替安排；呼吸配合腹横肌收紧，避免屏气与颈部代偿。'
    },
    {
      id: 'obliques',
      name: '腹外斜肌',
      nameEn: 'External Oblique',
      latin: 'Musculus obliquus externus abdominis',
      pinyin: 'fu wai xie ji',
      group: 'core',
      color: '#c04330',
      views: ['front', 'left', 'right'],
      summary: '腹壁外侧最表层的斜行肌，纤维走向如插兜，负责躯干旋转与侧屈。',
      origin: '第 5-12 肋骨外面',
      insertion: '髂嵴、腹白线、腹股沟韧带',
      duties: ['躯干向对侧旋转', '躯干同侧侧屈', '增加腹压并稳定骨盆'],
      training: '俄罗斯转体、侧向卷腹、跪姿砍劈；旋转动作要控制速度，腰椎避免过度扭转。'
    },
    {
      id: 'serratus-anterior',
      name: '前锯肌',
      nameEn: 'Serratus Anterior',
      latin: 'Musculus serratus anterior',
      pinyin: 'qian ju ji',
      group: 'chest',
      color: '#c9563b',
      views: ['front'],
      summary: '肋骨外侧锯齿状排列的肌肉，把肩胛骨稳定在胸壁上，是拳击手出拳的标志肌。',
      origin: '第 1-9 肋外侧面',
      insertion: '肩胛骨内侧缘前面',
      duties: ['前伸肩胛骨（推的动作）', '上回旋肩胛骨（过顶动作）', '把肩胛骨压贴胸壁，防止翼状肩'],
      training: '俯卧撑推起顶端充分前伸、墙面肩胛俯卧撑、过顶推举配合上回旋；重量过大容易练成耸肩。'
    },
    {
      id: 'gluteus-maximus',
      name: '臀大肌',
      nameEn: 'Gluteus Maximus',
      latin: 'Musculus gluteus maximus',
      pinyin: 'tun da ji',
      group: 'glutes',
      color: '#b8432e',
      views: ['back'],
      summary: '人体体积最大的肌肉之一，是伸髋与维持直立的核心引擎。',
      origin: '髂骨后部、骶骨与尾骨后面、骶结节韧带',
      insertion: '髂胫束与股骨臀肌粗隆',
      duties: ['伸展髋关节（起身、爬楼、跳跃）', '髋关节外旋', '稳定骨盆与躯干'],
      training: '深蹲、臀桥、罗马尼亚硬拉；重点是髋主导而不是腰部发力，顶峰位主动夹紧臀部。'
    },
    {
      id: 'gluteus-medius',
      name: '臀中肌',
      nameEn: 'Gluteus Medius',
      latin: 'Musculus gluteus medius',
      pinyin: 'tun zhong ji',
      group: 'glutes',
      color: '#c04d33',
      views: ['back', 'left', 'right'],
      summary: '臀外侧的扇形肌，单腿站立时稳住骨盆，是防止膝内扣的关键。',
      origin: '髂骨翼外面（臀前线与臀后线之间）',
      insertion: '股骨大转子外侧面',
      duties: ['髋关节外展', '单腿支撑时保持骨盆水平', '髋关节内旋（前束）与外旋（后束）'],
      training: '侧卧抬腿、蚌式开合、单腿硬拉、弹力带侧走；跑步与深蹲前先激活，能减少膝痛。'
    },
    {
      id: 'hip-flexors',
      name: '髂腰肌',
      nameEn: 'Iliopsoas',
      latin: 'Musculus iliopsoas',
      pinyin: 'qia yao ji',
      group: 'core',
      color: '#a84838',
      views: ['front'],
      summary: '腰大肌与髂肌合成的深层屈髋肌，连接脊柱与股骨，对腰椎稳定影响很大。',
      origin: '腰大肌起自第 12 胸椎至第 5 腰椎椎体与横突；髂肌起自髂窝',
      insertion: '共同止于股骨小转子',
      duties: ['屈曲髋关节（抬腿、迈步）', '腰椎稳定与骨盆前倾控制', '髋关节外旋'],
      training: '悬垂举腿、负重抬腿强化；久坐者更需弓步髋屈肌拉伸与臀肌强化，避免骨盆前倾。'
    },
    {
      id: 'quadriceps',
      name: '股四头肌',
      nameEn: 'Quadriceps Femoris',
      latin: 'Musculus quadriceps femoris',
      pinyin: 'gu si tou ji',
      group: 'legs',
      color: '#c8422c',
      views: ['front'],
      summary: '大腿前侧四个头组成的强大肌群，是伸膝唯一主力，也参与屈髋。',
      origin: '股直肌起自髂前下棘；股外侧肌、股内侧肌、股中间肌起自股骨体',
      insertion: '共同经髌骨与髌韧带止于胫骨粗隆',
      duties: ['伸展膝关节（站起、蹬伸、踢腿）', '股直肌协助屈髋', '稳定髌骨与膝关节'],
      training: '深蹲、腿举、腿屈伸；下蹲时膝盖与脚尖同向，全幅度训练兼顾股内侧肌与力量增长。'
    },
    {
      id: 'hamstrings',
      name: '腘绳肌',
      nameEn: 'Hamstrings',
      latin: 'Musculi ischiocrurales',
      pinyin: 'guo sheng ji',
      group: 'legs',
      color: '#ab3a2b',
      views: ['back'],
      summary: '大腿后侧三块肌（股二头肌、半腱肌、半膜肌），同时跨髋膝两个关节。',
      origin: '坐骨结节（股二头肌短头起自股骨粗线）',
      insertion: '腓骨头（股二头肌）、胫骨内侧（半腱肌、半膜肌）',
      duties: ['屈曲膝关节', '伸展髋关节', '在跑步摆动期离心控制小腿'],
      training: '硬拉类练髋伸、腿弯举练膝屈、北欧弯举练离心；跑者尤其需要强化离心能力以防拉伤。'
    },
    {
      id: 'adductors',
      name: '大腿内收肌群',
      nameEn: 'Hip Adductors',
      latin: 'Musculi adductores femoris',
      pinyin: 'da tui nei shou ji qun',
      group: 'legs',
      color: '#b54432',
      views: ['front'],
      summary: '大腿内侧一组肌肉，负责把腿向内收拢，并协助稳定骨盆与髋关节。',
      origin: '耻骨、坐骨支及坐骨结节',
      insertion: '股骨粗线内侧唇（股薄肌止于胫骨内侧鹅足）',
      duties: ['髋关节内收', '协助屈髋与伸髋', '稳定骨盆、控制变向'],
      training: '大腿内收机、宽距深蹲、哥本哈根侧平板；内收肌拉伤在变向运动中常见，应渐进负荷。'
    },
    {
      id: 'sartorius',
      name: '缝匠肌',
      nameEn: 'Sartorius',
      latin: 'Musculus sartorius',
      pinyin: 'feng jiang ji',
      group: 'legs',
      color: '#cf5a3c',
      views: ['front'],
      summary: '人体最长的肌肉，从髋外侧斜跨到大腿内侧，形如裁缝盘腿坐姿。',
      origin: '髂前上棘',
      insertion: '胫骨粗隆内侧（鹅足）',
      duties: ['屈曲膝关节', '屈曲、外展并外旋髋关节', '协助维持盘腿坐姿'],
      training: '单独训练意义有限，多参与弓步、深蹲的稳定；拉伸时可做盘腿前屈与蝴蝶式。'
    },
    {
      id: 'gastrocnemius',
      name: '小腿三头肌',
      nameEn: 'Gastrocnemius & Soleus',
      latin: 'Musculus triceps surae',
      pinyin: 'xiao tui san tou ji',
      group: 'legs',
      color: '#bd4430',
      views: ['back'],
      summary: '小腿后侧的腓肠肌与比目鱼肌合称，经跟腱止于跟骨，是行走跳跃的弹簧。',
      origin: '腓肠肌内、外侧头起自股骨内外侧髁；比目鱼肌起自胫腓骨后面',
      insertion: '共同经跟腱止于跟骨结节',
      duties: ['跖屈踝关节（提踵、蹬地）', '腓肠肌协助屈膝', '吸收落地冲击、储存弹性势能'],
      training: '站姿提踵练腓肠肌、坐姿提踵练比目鱼肌，配合跳绳与跳箱；全幅度、顶峰停顿 1 秒。'
    },
    {
      id: 'tibialis-anterior',
      name: '胫骨前肌',
      nameEn: 'Tibialis Anterior',
      latin: 'Musculus tibialis anterior',
      pinyin: 'jing gu qian ji',
      group: 'legs',
      color: '#c8513a',
      views: ['front'],
      summary: '小腿前外侧的肌肉，负责勾脚背，与小腿后侧形成拮抗平衡。',
      origin: '胫骨外侧髁及胫骨体前外侧面',
      insertion: '内侧楔骨与第 1 跖骨底',
      duties: ['踝关节背屈（勾脚）', '足内翻', '行走摆动期防止拖地'],
      training: '靠墙勾脚、脚跟行走、弹力带背屈；跑者胫骨前肌疲劳易导致胫骨内侧疼痛。'
    },
    {
      id: 'sternocleidomastoid',
      name: '胸锁乳突肌',
      nameEn: 'Sternocleidomastoid',
      latin: 'Musculus sternocleidomastoideus',
      pinyin: 'xiong suo ru tu ji',
      group: 'neck',
      color: '#c04b35',
      views: ['front'],
      summary: '颈前两侧的斜行肌，是转头与点头最直观的肌肉，也是长期低头最易紧张的位置。',
      origin: '胸骨柄前面、锁骨内侧 1/3',
      insertion: '颞骨乳突及上项线外侧',
      duties: ['双侧收缩屈颈（低头）', '单侧收缩侧屈并向对侧转头', '辅助吸气（上提胸廓）'],
      training: '颈屈伸等长抗阻、下巴微收、颈部侧屈拉伸；避免长时间前倾低头，久坐每小时活动一次。'
    }
  ];

  /* 建立 id -> muscle 索引，供 UI / 引擎 O(1) 查询 */
  var byId = {};
  for (var i = 0; i < muscles.length; i++) {
    byId[muscles[i].id] = muscles[i];
  }

  A.groups = groups;
  A.muscles = muscles;
  A.muscleById = byId;
})(typeof window !== 'undefined' ? window : this);
