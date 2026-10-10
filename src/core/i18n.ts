/* Composition — en/tc/sc user-interface language.
   One dictionary, keyed by string id, with an {en, tc, sc} column each.
   Dynamic code calls t(); static index.html strings wear data-i18n attributes
   (data-i18n-ph for placeholders, data-i18n-aria for aria-labels,
   data-i18n-title for titles) and applyI18n() swaps them in place.
   Anything without a translation falls back to English, then to the key itself,
   so a missing entry degrades to the old behaviour instead of blanking. */

import { Settings } from './settings.js';

export type AppLang = 'en' | 'tc' | 'sc';
export type LangSetting = 'system' | AppLang;

interface DictEntry { en: string; tc: string; sc: string; }

const STR: Record<string, DictEntry> = {
  /* shell + nav */
  'skip.content': { en: 'Skip to content', tc: '跳至內容', sc: '跳至内容' },
  'view.dashboard': { en: 'Today', tc: '今日', sc: '今日' },
  'view.trends': { en: 'Trends', tc: '趨勢', sc: '趋势' },
  'view.history': { en: 'History', tc: '歷史記錄', sc: '历史记录' },
  'view.settings': { en: 'Settings', tc: '設定', sc: '设置' },
  'view.detail': { en: 'Reading', tc: '讀數', sc: '读数' },
  'nav.today': { en: 'Today', tc: '今日', sc: '今日' },
  'nav.trends': { en: 'Trends', tc: '趨勢', sc: '趋势' },
  'nav.history': { en: 'History', tc: '歷史記錄', sc: '历史记录' },
  'nav.settings': { en: 'Settings', tc: '設定', sc: '设置' },
  'nav.primary': { en: 'Primary', tc: '主導航', sc: '主导航' },
  'nav.desktop': { en: 'Desktop primary', tc: '桌面主導航', sc: '桌面主导航' },

  /* auth */
  'auth.title.1': { en: 'Read once.', tc: '讀一次。', sc: '读一次。' },
  'auth.title.2': { en: 'Kept for good.', tc: '永久保留。', sc: '永久保留。' },
  'auth.lede.pre': { en: 'Reads and logs your ', tc: '讀取並記錄你的', sc: '读取并记录你的' },
  'auth.lede.post': { en: ' reports.', tc: '報告。', sc: '报告。' },
  'auth.signin': { en: 'Continue with Google', tc: '使用 Google 繼續', sc: '使用 Google 继续' },
  'auth.noSupabase': { en: 'Google sign-in is unavailable until Supabase is configured.', tc: '在設定 Supabase 之前無法使用 Google 登入。', sc: '在设置 Supabase 之前无法使用 Google 登录。' },
  'auth.opening': { en: 'Opening Google…', tc: '正在開啟 Google…', sc: '正在打开 Google…' },
  'auth.startFail': { en: 'Sign-in could not start. Check the Supabase Google provider and redirect URL.', tc: '無法開始登入。請檢查 Supabase Google 提供者及重新導向網址。', sc: '无法开始登录。请检查 Supabase Google 提供者及重定向网址。' },

  /* dashboard */
  'dash.setup.title': { en: 'Supabase setup required', tc: '需要設定 Supabase', sc: '需要设置 Supabase' },
  'dash.setup.body': { en: 'Configure Supabase before using the OCR proxy.', tc: '使用 OCR 代理前請先設定 Supabase。', sc: '使用 OCR 代理前请先设置 Supabase。' },
  'dash.setup.btn': { en: 'Setup', tc: '設定', sc: '设置' },
  'dash.ring.label': { en: 'Body fat percentage', tc: '體脂率', sc: '体脂率' },
  'dash.ring.unit': { en: '% body fat', tc: '% 體脂', sc: '% 体脂' },
  'dash.hero.eyebrow': { en: 'Latest reading', tc: '最新讀數', sc: '最新读数' },
  'dash.hero.meta': { en: '{date} · {rel} · player {player} · {n} reading{s} on this device', tc: '{date} · {rel} · 用戶 {player} · 此裝置共 {n} 筆讀數', sc: '{date} · {rel} · 用户 {player} · 此设备共 {n} 笔读数' },
  'dash.hero.meta.noplayer': { en: '{date} · {rel} · {n} reading{s} on this device', tc: '{date} · {rel} · 此裝置共 {n} 筆讀數', sc: '{date} · {rel} · 此设备共 {n} 笔读数' },
  'dash.empty.title': { en: 'No readings yet', tc: '尚無讀數', sc: '尚无读数' },
  'dash.empty.body': { en: 'Point the camera at the QR code printed on a Tanita report, share the PDF to the app, or enter the numbers yourself. Everything lands here.', tc: '將相機對準 Tanita 報告上的二維碼、把 PDF 分享到本應用，或自行輸入數字，全部都會集中在此。', sc: '将相机对准 Tanita 报告上的二维码、把 PDF 分享到本应用，或自行输入数字，全部都会集中于此。' },
  'dash.empty.btn': { en: 'Add your first reading', tc: '新增第一筆讀數', sc: '新增第一笔读数' },
  'dash.deltas.title': { en: 'Change since last reading', tc: '自上次讀數的變化', sc: '自上次读数的变化' },
  'dash.deltas.need2': { en: 'Needs two readings', tc: '需要兩筆讀數', sc: '需要两笔读数' },
  'dash.deltas.prev': { en: 'Compared with your previous reading', tc: '與上次讀數比較', sc: '与上次读数比较' },
  'dash.trend.title': { en: 'Recent shape', tc: '近期走勢', sc: '近期走势' },
  'dash.trend.all': { en: 'All trends', tc: '全部趨勢', sc: '全部趋势' },
  'dash.insights.title': { en: 'What the numbers say', tc: '數據解讀', sc: '数据解读' },
  'dash.all.title': { en: 'All measurements', tc: '全部量度', sc: '全部测量' },

  /* insights */
  'insights.one': { en: 'One reading so far', tc: '目前只有一筆讀數', sc: '目前只有一笔读数' },
  'insights.one.body': { en: 'Add a second reading and the direction of travel appears here.', tc: '新增第二筆讀數後即可在此看到走勢。', sc: '新增第二笔读数后即可在此看到走势。' },
  'insights.bf.down': { en: 'Body fat has moved down', tc: '體脂下降', sc: '体脂下降' },
  'insights.bf.up': { en: 'Body fat has moved up', tc: '體脂上升', sc: '体脂上升' },
  'insights.bf.body': { en: '{v} points {dir} than your earliest reading, across {n} readings.', tc: '比最早讀數{dir}{v} 個百分點，共 {n} 筆讀數。', sc: '比最早读数{dir}{v} 个百分点，共 {n} 笔读数。' },
  'insights.bf.lower': { en: 'lower', tc: '低', sc: '低' },
  'insights.bf.higher': { en: 'higher', tc: '高', sc: '高' },
  'insights.mm.up': { en: 'Muscle mass is up', tc: '肌肉量上升', sc: '肌肉量上升' },
  'insights.mm.down': { en: 'Muscle mass is down', tc: '肌肉量下降', sc: '肌肉量下降' },
  'insights.mm.body': { en: '{v} {unit} {dir} your earliest reading.', tc: '比最早讀數{dir}{v} {unit}。', sc: '比最早读数{dir}{v} {unit}。' },
  'insights.mm.above': { en: 'above', tc: '高', sc: '高' },
  'insights.mm.below': { en: 'below', tc: '低', sc: '低' },
  'insights.spread.title': { en: 'Weight spread over 90 days', tc: '90 天體重波幅', sc: '90 天体重波幅' },
  'insights.spread.body': { en: 'A range of {spread} across {n} readings, with the latest at {last}.', tc: '共 {n} 筆讀數，波幅 {spread}，最新為 {last}。', sc: '共 {n} 笔读数，波幅 {spread}，最新为 {last}。' },
  'insights.cadence': { en: 'Cadence', tc: '量度頻率', sc: '测量频率' },
  'insights.cadence.body': { en: '{n} reading{s} in the last 30 days. The most recent was {rel}.', tc: '過去 30 天共 {n} 筆讀數，最近一次為{rel}。', sc: '过去 30 天共 {n} 笔读数，最近一次为{rel}。' },
  'insights.note': { en: 'These lines describe what your own readings show. They are not medical advice.', tc: '以上僅描述你的讀數走勢，並非醫療建議。', sc: '以上仅描述你的读数走势，并非医疗建议。' },

  /* relative days */
  'rel.today': { en: 'today', tc: '今天', sc: '今天' },
  'rel.yesterday': { en: 'yesterday', tc: '昨天', sc: '昨天' },
  'rel.days': { en: '{n} days ago', tc: '{n} 天前', sc: '{n} 天前' },
  'rel.month': { en: 'a month ago', tc: '一個月前', sc: '一个月前' },
  'rel.months': { en: '{n} months ago', tc: '{n} 個月前', sc: '{n} 个月前' },

  /* chips + tiles */
  'chip.nocomp': { en: 'No comparison yet', tc: '尚無比較', sc: '尚无比较' },
  'chip.nochange': { en: 'No change', tc: '無變化', sc: '无变化' },
  'tile.unrecorded': { en: 'Not recorded yet', tc: '尚未記錄', sc: '尚未记录' },
  'tile.one': { en: 'Only one reading so far', tc: '目前只有一筆讀數', sc: '目前只有一笔读数' },

  /* trends */
  'trends.groups.label': { en: 'Choose a group of measures', tc: '選擇量度組別', sc: '选择量度组别' },
  'trends.range.label': { en: 'Choose a time range', tc: '選擇時間範圍', sc: '选择时间范围' },
  'trends.prev': { en: 'Previous measure', tc: '上一項量度', sc: '上一项量度' },
  'trends.next': { en: 'Next measure', tc: '下一項量度', sc: '下一项量度' },
  'trends.high': { en: 'High', tc: '最高', sc: '最高' },
  'trends.low': { en: 'Low', tc: '最低', sc: '最低' },
  'trends.avg': { en: 'Avg', tc: '平均', sc: '平均' },
  'trends.summary': { en: 'Selected measure summary', tc: '所選量度摘要', sc: '所选量度摘要' },
  'trends.points': { en: '{n} point{s}', tc: '{n} 點', sc: '{n} 点' },
  'trends.averaged': { en: '{n} readings averaged', tc: '{n} 筆讀數取平均', sc: '{n} 笔读数取平均' },
  'trends.over': { en: '{d} over the window', tc: '期間變化 {d}', sc: '期间变化 {d}' },
  'trends.split.title': { en: 'Composition split', tc: '體組成', sc: '体组成' },
  'trends.split.need': { en: 'A reading with both weight and body fat is needed for the split.', tc: '需要同時有體重和體脂的讀數才能顯示分佈。', sc: '需要同时有体重和体脂的读数才能显示分布。' },
  'trends.split.lean': { en: 'Lean and other tissue', tc: '瘦組織及其他', sc: '瘦组织及其他' },
  'trends.split.fat': { en: 'Fat mass', tc: '脂肪量', sc: '脂肪量' },
  'trends.split.total': { en: 'Total', tc: '總計', sc: '总计' },
  'trends.split.note': { en: 'Fat mass is derived from your weight and body fat percentage. {date}.', tc: '脂肪量由體重和體脂率推算。{date}。', sc: '脂肪量由体重和体脂率推算。{date}。' },

  /* history */
  'hist.filter': { en: 'Filter readings by date or source', tc: '按日期或來源篩選讀數', sc: '按日期或来源筛选读数' },
  'hist.export': { en: 'Export', tc: '匯出', sc: '导出' },
  'hist.empty': { en: 'Nothing matches', tc: '沒有相符項目', sc: '没有相符项目' },
  'hist.empty.body': { en: 'Try a different date, or clear the filter to see every reading.', tc: '試試其他日期，或清除篩選以查看全部讀數。', sc: '试试其他日期，或清除筛选以查看全部读数。' },
  'hist.clear': { en: 'Clear filter', tc: '清除篩選', sc: '清除筛选' },

  /* detail */
  'detail.back': { en: 'Back', tc: '返回', sc: '返回' },
  'detail.gone': { en: 'That reading is no longer on this device.', tc: '該讀數已不在此裝置上。', sc: '该读数已不在此设备上。' },
  'detail.report': { en: 'Full report', tc: '完整報告', sc: '完整报告' },
  'detail.report.note': { en: 'Every extracted field', tc: '所有擷取欄位', sc: '所有提取字段' },
  'detail.normal': { en: 'normal {lo}–{hi}{unit}', tc: '正常 {lo}–{hi}{unit}', sc: '正常 {lo}–{hi}{unit}' },
  'detail.standard': { en: 'standard {v}{unit}', tc: '標準 {v}{unit}', sc: '标准 {v}{unit}' },
  'detail.saved': { en: 'Saved {date}', tc: '已儲存 {date}', sc: '已保存 {date}' },
  'detail.delete': { en: 'Delete reading', tc: '刪除讀數', sc: '删除读数' },
  'detail.confirm': { en: 'Delete this reading from this device? This cannot be undone.', tc: '確定從此裝置刪除此讀數？此操作無法復原。', sc: '确定从此设备删除此读数？此操作无法撤销。' },
  'detail.deleted': { en: 'Reading deleted', tc: '讀數已刪除', sc: '读数已删除' },

  /* settings */
  'set.account': { en: 'Account', tc: '帳戶', sc: '账户' },
  'set.signed.out': { en: 'Not signed in', tc: '尚未登入', sc: '尚未登录' },
  'set.signed.in': { en: 'Signed in', tc: '已登入', sc: '已登录' },
  'set.noaccount': { en: 'No account connected', tc: '未連結帳戶', sc: '未连接账户' },
  'set.signout': { en: 'Sign out', tc: '登出', sc: '登出' },
  'set.signin': { en: 'Sign in', tc: '登入', sc: '登录' },
  'set.appearance': { en: 'Reading and appearance', tc: '讀數與外觀', sc: '读数与外观' },
  'set.theme': { en: 'Theme', tc: '主題', sc: '主题' },
  'set.theme.sub': { en: 'Follows your system unless you choose.', tc: '未選擇時跟隨系統。', sc: '未选择时跟随系统。' },
  'set.theme.system': { en: 'System', tc: '系統', sc: '系统' },
  'set.theme.light': { en: 'Light', tc: '淺色', sc: '浅色' },
  'set.theme.dark': { en: 'Dark', tc: '深色', sc: '深色' },
  'set.mass': { en: 'Mass unit', tc: '重量單位', sc: '重量单位' },
  'set.mass.sub': { en: 'Body weight, muscle and bone mass.', tc: '體重、肌肉及骨量。', sc: '体重、肌肉及骨量。' },
  'set.mass.kg': { en: 'Kilograms', tc: '公斤', sc: '公斤' },
  'set.mass.lb': { en: 'Pounds', tc: '磅', sc: '磅' },
  'set.lang': { en: 'Language', tc: '語言', sc: '语言' },
  'set.lang.sub': { en: 'App and report language.', tc: '應用及報告語言。', sc: '应用及报告语言。' },
  'set.motion': { en: 'Reduce motion', tc: '減少動態效果', sc: '减少动态效果' },
  'set.motion.sub': { en: 'Follows the system preference by default.', tc: '預設跟隨系統偏好。', sc: '默认跟随系统偏好。' },
  'set.data': { en: 'Your data', tc: '你的數據', sc: '你的数据' },
  'set.count': { en: 'Readings on this device', tc: '此裝置上的讀數', sc: '此设备上的读数' },
  'set.count.n': { en: '{n} reading{s}', tc: '{n} 筆讀數', sc: '{n} 笔读数' },
  'set.count.none': { en: '0 readings on this device', tc: '此裝置尚無讀數', sc: '此设备尚无读数' },
  'set.storage': { en: 'Storage used', tc: '已用儲存空間', sc: '已用存储空间' },
  'set.export.json': { en: 'Export JSON', tc: '匯出 JSON', sc: '导出 JSON' },
  'set.export.csv': { en: 'Export CSV', tc: '匯出 CSV', sc: '导出 CSV' },
  'set.export.copy': { en: 'Copy summary', tc: '複製摘要', sc: '复制摘要' },
  'set.install': { en: 'Install and sync', tc: '安裝與同步', sc: '安装与同步' },
  'set.installable': { en: 'Installable app', tc: '可安裝應用', sc: '可安装应用' },
  'set.installed': { en: 'Installed. Camera and offline use are available.', tc: '已安裝，可使用相機及離線功能。', sc: '已安装，可使用相机及离线功能。' },
  'set.install.btn': { en: 'Install', tc: '安裝', sc: '安装' },
  'set.mirror': { en: 'Cloud mirror', tc: '雲端鏡像', sc: '云端镜像' },
  'set.mirror.sub': { en: 'Sync to cloud', tc: '同步至雲端', sc: '同步至云端' },
  'set.mirror.on': { en: 'Cloud mirror on — new readings copy to your project', tc: '雲端鏡像已開啟 — 新讀數將複製到你的專案', sc: '云端镜像已开启 — 新读数将复制到你的项目' },
  'set.mirror.off': { en: 'Cloud mirror off', tc: '雲端鏡像已關閉', sc: '云端镜像已关闭' },
  'set.lastsync': { en: 'Last sync', tc: '上次同步', sc: '上次同步' },
  'set.never': { en: 'Never synced', tc: '從未同步', sc: '从未同步' },
  'set.syncnow': { en: 'Sync now', tc: '立即同步', sc: '立即同步' },
  'set.samsung': { en: 'Samsung Health export', tc: 'Samsung Health 匯出', sc: 'Samsung Health 导出' },
  'set.danger': { en: 'Danger zone', tc: '危險區', sc: '危险区' },
  'set.erase': { en: 'Erase everything', tc: '清除全部', sc: '清除全部' },
  'set.erase.sub': { en: 'Deletes every reading from this device. Export first if you want a copy.', tc: '刪除此裝置上的所有讀數。如需保留請先匯出。', sc: '删除此设备上的所有读数。如需保留请先导出。' },
  'set.erase.btn': { en: 'Erase', tc: '清除', sc: '清除' },
  'set.signin.mirror': { en: 'Sign in before mirroring readings', tc: '鏡像前請先登入', sc: '镜像前请先登录' },
  'set.need.supa': { en: 'Add your Supabase URL and anon key first', tc: '請先填寫 Supabase 網址及 anon key', sc: '请先填写 Supabase 网址及 anon key' },
  'set.syncing': { en: 'Syncing…', tc: '同步中…', sc: '同步中…' },
  'set.synced': { en: 'Synced {n} reading{s} · {u} up · {d} down', tc: '已同步 {n} 筆讀數 · 上傳 {u} · 下載 {d}', sc: '已同步 {n} 笔读数 · 上传 {u} · 下载 {d}' },
  'set.mirror.fail': { en: 'The mirror did not answer', tc: '鏡像沒有回應', sc: '镜像没有回应' },
  'set.saved': { en: 'Configuration saved — reconnecting', tc: '設定已儲存，重新連線中', sc: '设置已保存，重新连接中' },
  'set.testing': { en: 'Testing the proxy…', tc: '測試代理中…', sc: '测试代理中…' },
  'set.live': { en: 'Proxy is live', tc: '代理正常', sc: '代理正常' },
  'set.proxy.fail': { en: 'The proxy did not answer', tc: '代理沒有回應', sc: '代理没有回应' },
  'set.signout.confirm': { en: 'Sign out? Readings stay on this device.', tc: '確定登出？讀數會保留在此裝置。', sc: '确定登出？读数会保留在此设备。' },
  'set.erase.confirm': { en: 'Delete every reading from this device? Export first if you want a copy.', tc: '確定刪除此裝置上的所有讀數？如需保留請先匯出。', sc: '确定删除此设备上的所有读数？如需保留请先导出。' },
  'set.erased': { en: 'All readings erased', tc: '所有讀數已清除', sc: '所有读数已清除' },
  'set.pill.ok': { en: 'Connected', tc: '已連接', sc: '已连接' },
  'set.pill.warn': { en: 'Not configured', tc: '未設定', sc: '未设置' },
  'set.proxy.ok': { en: 'Readings are read inside your own Supabase project. The key never reaches this app.', tc: '報告在你的 Supabase 專案內讀取，金鑰不會傳到本應用。', sc: '报告在你的 Supabase 项目内读取，密钥不会传到本应用。' },
  'set.proxy.need': { en: 'Configure Supabase before using the OCR proxy.', tc: '使用 OCR 代理前請先設定 Supabase。', sc: '使用 OCR 代理前请先设置 Supabase。' },

  /* capture sheet + scan fan */
  'capture.title': { en: 'Add a reading', tc: '新增讀數', sc: '新增读数' },
  'capture.link': { en: 'Paste a report link', tc: '貼上報告連結', sc: '粘贴报告链接' },
  'capture.link.sub': { en: 'Paste the link from your report. Composition fetches and reads it for you.', tc: '貼上報告連結，Composition 會為你抓取並讀取。', sc: '粘贴报告链接，Composition 会为你抓取并读取。' },
  'capture.link.ph': { en: 'Paste the report link here', tc: '在此貼上報告連結', sc: '在此粘贴报告链接' },
  'capture.fetch': { en: 'Fetch report', tc: '抓取報告', sc: '抓取报告' },
  'fan.scan': { en: 'Scan', tc: '掃描', sc: '扫描' },
  'fan.upload': { en: 'Upload', tc: '上載', sc: '上传' },
  'fan.link': { en: 'Link', tc: '連結', sc: '链接' },
  'fan.type': { en: 'Type', tc: '輸入', sc: '输入' },
  'fan.scan.qr': { en: 'Scan a report QR code', tc: '掃描報告二維碼', sc: '扫描报告二维码' },
  'fan.scan.report': { en: 'Scan the report QR code', tc: '掃描報告二維碼', sc: '扫描报告二维码' },
  'fan.upload.file': { en: 'Upload a PDF or photo', tc: '上載 PDF 或相片', sc: '上传 PDF 或照片' },
  'fan.paste.link': { en: 'Paste the report link', tc: '貼上報告連結', sc: '粘贴报告链接' },
  'fan.type.numbers': { en: 'Type the numbers', tc: '手動輸入數字', sc: '手动输入数字' },

  /* processing overlay */
  'proc.reading': { en: 'Reading the report', tc: '正在讀取報告', sc: '正在读取报告' },
  'proc.fetching': { en: 'Fetching the page, then reading it.', tc: '正在為你抓取頁面並讀取。', sc: '正在为你抓取页面并读取。' },
  'proc.step.fetch': { en: 'Fetching the report', tc: '抓取報告', sc: '抓取报告' },
  'proc.step.ocr': { en: 'Reading the numbers', tc: '讀取數字', sc: '读取数字' },
  'proc.step.done': { en: 'Checking the result', tc: '檢查結果', sc: '检查结果' },

  /* review */
  'review.check': { en: 'Check the numbers', tc: '檢查數字', sc: '检查数字' },
  'review.report': { en: 'Review report', tc: '覆核報告', sc: '核对报告' },
  'review.source': { en: 'Reading source', tc: '讀數來源', sc: '读数来源' },
  'review.context': { en: 'Report context', tc: '報告內容', sc: '报告内容' },
  'review.manual': { en: 'Manual entry', tc: '手動輸入', sc: '手动输入' },
  'review.input': { en: 'Input', tc: '輸入方式', sc: '输入方式' },
  'review.extraction': { en: 'Extraction', tc: '擷取方式', sc: '提取方式' },
  'review.unknown': { en: 'Unknown', tc: '未知', sc: '未知' },
  'review.confidence': { en: 'Confidence', tc: '可信度', sc: '可信度' },
  'review.player': { en: 'Player', tc: '用戶', sc: '用户' },
  'review.serial': { en: 'Serial', tc: '序號', sc: '序号' },
  'review.link': { en: 'Report link', tc: '報告連結', sc: '报告链接' },
  'review.meta': { en: 'Report metadata', tc: '報告元數據', sc: '报告元数据' },
  'review.readonly': { en: 'Read only', tc: '唯讀', sc: '只读' },
  'review.measurements': { en: 'Measurements', tc: '量度', sc: '测量' },
  'review.measured': { en: 'Measured at', tc: '量度時間', sc: '测量时间' },
  'review.add': { en: 'Add another metric', tc: '新增其他量度', sc: '新增其他测量' },
  'review.sections': { en: 'Sections of this reading', tc: '此讀數的分節', sc: '此读数的分节' },
  'review.cancel': { en: 'Cancel', tc: '取消', sc: '取消' },
  'review.save': { en: 'Save reading', tc: '儲存讀數', sc: '保存读数' },
  'review.nan': { en: '{label} is not a number.', tc: '{label}不是數字。', sc: '{label}不是数字。' },
  'review.between': { en: '{label} should sit between {min} and {max}{unit}.', tc: '{label}應介乎 {min} 與 {max}{unit}。', sc: '{label}应介于 {min} 与 {max}{unit}。' },
  'review.nodate': { en: 'The measurement date is missing.', tc: '未填寫量度日期。', sc: '未填写测量日期。' },
  'review.empty': { en: 'Add at least one measurement before saving.', tc: '儲存前請至少新增一項量度。', sc: '保存前请至少新增一项测量。' },
  'review.ocrnote': { en: 'OCR note', tc: 'OCR 備註', sc: 'OCR 备注' },
  'review.preview.alt': { en: 'The attachment being read', tc: '正在讀取的附件', sc: '正在读取的附件' },

  /* sources */
  'source.qr': { en: 'QR scan', tc: '二維碼掃描', sc: '二维码扫描' },
  'source.link': { en: 'Report link', tc: '報告連結', sc: '报告链接' },
  'source.file': { en: 'Shared file', tc: '分享檔案', sc: '分享文件' },
  'source.share': { en: 'Shared file', tc: '分享檔案', sc: '分享文件' },
  'source.manual': { en: 'Entered by hand', tc: '手動輸入', sc: '手动输入' },

  /* pipeline + builder + store */
  'pipe.entered': { en: 'Entered by hand.', tc: '手動輸入。', sc: '手动输入。' },
  'pipe.sending': { en: 'Sending {name} straight for reading — no fetching needed.', tc: '直接傳送{name}進行讀取 — 無需抓取。', sc: '直接传送{name}进行读取 — 无需抓取。' },
  'pipe.noproxy': { en: 'The OCR proxy is not configured, so the report cannot be fetched or read. Add your Supabase details in Settings, or enter the numbers by hand.', tc: 'OCR 代理尚未設定，無法抓取或讀取報告。請在設定中填寫 Supabase 資料，或手動輸入數字。', sc: 'OCR 代理尚未设置，无法抓取或读取报告。请在设置中填写 Supabase 资料，或手动输入数字。' },
  'pipe.playerid.nobase': { en: 'Only a player id was found, and no report address is configured. Add one in Settings, or paste the full report link.', tc: '只找到用戶編號，但未設定報告網址。請在設定中新增，或貼上完整報告連結。', sc: '只找到用户编号，但未设置报告网址。请在设置中新增，或粘贴完整报告链接。' },
  'pipe.playerid.noproxy': { en: 'Only a player id was found. The full report link is needed, and the proxy must be configured to fetch it.', tc: '只找到用戶編號，需要完整報告連結，且代理必須已設定才能抓取。', sc: '只找到用户编号，需要完整报告链接，且代理必须已设置才能抓取。' },
  'pipe.read.from': { en: 'Read from {file} with {method}.', tc: '從{file}讀取，方式：{method}。', sc: '从{file}读取，方式：{method}。' },
  'pipe.read.fetched': { en: 'Fetched from {host} via {method}.', tc: '從 {host} 抓取，方式：{method}。', sc: '从 {host} 抓取，方式：{method}。' },
  'pipe.read.player': { en: 'Fetched from player {id} via {method}.', tc: '從用戶 {id} 抓取，方式：{method}。', sc: '从用户 {id} 抓取，方式：{method}。' },
  'pipe.method.api': { en: 'Tanita provider API (OCR not used)', tc: 'Tanita 官方 API（未使用 OCR）', sc: 'Tanita 官方 API（未使用 OCR）' },
  'pipe.method.ocr': { en: 'OCR fallback', tc: 'OCR 備用', sc: 'OCR 备用' },
  'pipe.method.manualfail': { en: 'Manual entry after extraction failure', tc: '擷取失敗後改為手動輸入', sc: '提取失败后改为手动输入' },
  'pipe.unreadable': { en: 'The report could not be read.', tc: '無法讀取報告。', sc: '无法读取报告。' },
  'pipe.type.instead': { en: 'Open the review screen and type the numbers instead?', tc: '改為開啟覆核畫面手動輸入數字？', sc: '改为打开核对画面手动输入数字？' },
  'pipe.entered.after': { en: 'Entered by hand after: {message}', tc: '手動輸入（原因：{message}）', sc: '手动输入（原因：{message}）' },
  'pipe.save.fail': { en: 'Could not save the provider reading: {message}', tc: '無法儲存官方報告讀數：{message}', sc: '无法保存官方报告读数：{message}' },
  'pipe.kept': { en: 'This report is already saved in more detail', tc: '此報告已有更詳細的儲存版本', sc: '此报告已有更详细的保存版本' },
  'pipe.updated': { en: 'Reading updated', tc: '讀數已更新', sc: '读数已更新' },
  'pipe.saved': { en: 'Reading saved', tc: '讀數已儲存', sc: '读数已保存' },
  'pipe.nosave': { en: 'Could not save to this device: {message}', tc: '無法儲存到此裝置：{message}', sc: '无法保存到此设备：{message}' },
  'pipe.nostore': { en: 'Local storage is unavailable in this browser. Readings cannot be saved.', tc: '此瀏覽器無法使用本地儲存，讀數無法儲存。', sc: '此浏览器无法使用本地存储，读数无法保存。' },

  /* scanner */
  'scan.starting': { en: 'Starting camera', tc: '正在啟動相機', sc: '正在启动相机' },
  'scan.hint': { en: 'Line the QR code up inside the frame', tc: '將二維碼對準框內', sc: '将二维码对准框内' },
  'scan.photo.btn': { en: 'Read a photo instead', tc: '改用相片讀取', sc: '改用照片读取' },
  'scan.ready': { en: 'Camera ready', tc: '相機就緒', sc: '相机就绪' },
  'scan.ready.fallback': { en: 'Camera ready (fallback reader)', tc: '相機就緒（備用讀碼器）', sc: '相机就绪（备用读码器）' },
  'scan.ready.photo': { en: 'Camera ready — photo mode', tc: '相機就緒 — 相片模式', sc: '相机就绪 — 照片模式' },
  'scan.nodecoder': { en: 'This browser has no in-page decoder. Take a photo of the code instead.', tc: '此瀏覽器無內建解碼，請改為拍攝二維碼相片。', sc: '此浏览器无内置解码，请改为拍摄二维码照片。' },
  'scan.unavailable': { en: 'Camera unavailable', tc: '相機無法使用', sc: '相机无法使用' },
  'scan.refused': { en: 'Camera access was refused or is unavailable. Use the report link or a photo instead.', tc: '相機權限被拒或無法使用，請改用報告連結或相片。', sc: '相机权限被拒或无法使用，请改用报告链接或照片。' },
  'scan.unavailable.msg': { en: 'Camera unavailable: {message}', tc: '相機無法使用：{message}', sc: '相机无法使用：{message}' },
  'scan.denied': { en: 'permission denied', tc: '權限被拒', sc: '权限被拒' },
  'scan.notorch': { en: 'This camera has no torch control.', tc: '此相機無電筒控制。', sc: '此相机无手电筒控制。' },
  'scan.torch.fail': { en: 'The torch could not be switched.', tc: '無法切換電筒。', sc: '无法切换手电筒。' },
  'scan.playerid.nobase': { en: 'A player id on its own needs a report address to look up. Add one in Settings.', tc: '僅有用戶編號需要報告網址才能查詢，請在設定中新增。', sc: '仅有用户编号需要报告网址才能查询，请在设置中新增。' },
  'scan.notlink': { en: 'That code is not a report link: {text}', tc: '該代碼不是報告連結：{text}', sc: '该代码不是报告链接：{text}' },

  /* shell events */
  'shell.paste.needbase': { en: 'A player id on its own needs a report address. Add one in Settings, or paste the full link.', tc: '僅有用戶編號需要報告網址，請在設定中新增，或貼上完整連結。', sc: '仅有用户编号需要报告网址，请在设置中新增，或粘贴完整链接。' },
  'shell.notlink': { en: 'That does not look like a report link', tc: '這不是有效的報告連結', sc: '这不是有效的报告链接' },
  'shell.toobig': { en: 'That file is larger than 18 MB', tc: '檔案超過 18 MB', sc: '文件超过 18 MB' },
  'shell.noqr': { en: 'No QR code found in that photo', tc: '相片中找不到二維碼', sc: '照片中找不到二维码' },
  'shell.codenotlink': { en: 'That code is not a report link', tc: '該代碼不是報告連結', sc: '该代码不是报告链接' },
  'shell.photofail': { en: 'The photo could not be read', tc: '相片無法讀取', sc: '照片无法读取' },

  /* services */
  'svc.nosupa': { en: 'Supabase is not configured yet.', tc: 'Supabase 尚未設定。', sc: 'Supabase 尚未设置。' },
  'svc.expired': { en: 'Your Google session expired. Sign in again to continue.', tc: 'Google 登入已過期，請重新登入。', sc: 'Google 登录已过期，请重新登录。' },
  'svc.noproxy': { en: 'The OCR proxy is not configured. Add your Supabase URL in Settings.', tc: 'OCR 代理尚未設定，請在設定中填寫 Supabase 網址。', sc: 'OCR 代理尚未设置，请在设置中填写 Supabase 网址。' },
  'svc.replied': { en: 'The proxy replied with {status}.', tc: '代理回應 {status}。', sc: '代理回应 {status}。' },
  'svc.unreadable': { en: 'The proxy could not read that report.', tc: '代理無法讀取該報告。', sc: '代理无法读取该报告。' },
  'svc.uncollected': { en: 'That shared file could not be collected.', tc: '無法接收該分享檔案。', sc: '无法接收该分享文件。' },
  'svc.shared.notlink': { en: 'The shared text was not a report link.', tc: '分享的文字不是報告連結。', sc: '分享的文字不是报告链接。' },
  'svc.nobase': { en: 'No report address is configured. Add one in Settings.', tc: '未設定報告網址，請在設定中新增。', sc: '未设置报告网址，请在设置中新增。' },
  'svc.mirror.signin': { en: 'Sign in before mirroring readings.', tc: '鏡像前請先登入。', sc: '镜像前请先登录。' },
  'svc.mirror.download': { en: 'The mirror could not download readings ({status}){detail}.', tc: '鏡像無法下載讀數（{status}）{detail}。', sc: '镜像无法下载读数（{status}）{detail}。' },
  'svc.mirror.badlist': { en: 'The mirror returned an invalid reading list.', tc: '鏡像傳回無效的讀數清單。', sc: '镜像返回无效的读数列表。' },
  'svc.mirror.upload': { en: 'The mirror could not upload readings ({status}){detail}.', tc: '鏡像無法上載讀數（{status}）{detail}。', sc: '镜像无法上传读数（{status}）{detail}。' },
  'svc.mirror.unreachable': { en: 'The mirror could not be reached.', tc: '無法連接鏡像。', sc: '无法连接镜像。' },

  /* export */
  'exp.json': { en: 'JSON exported', tc: 'JSON 已匯出', sc: 'JSON 已导出' },
  'exp.csv': { en: 'CSV exported', tc: 'CSV 已匯出', sc: 'CSV 已导出' },
  'exp.samsung.need': { en: 'Samsung Health import needs weight and body fat', tc: 'Samsung Health 匯入需要體重和體脂', sc: 'Samsung Health 导入需要体重和体脂' },
  'exp.samsung.done': { en: 'Samsung-shaped CSV exported', tc: 'Samsung 格式 CSV 已匯出', sc: 'Samsung 格式 CSV 已导出' },
  'exp.nothing': { en: 'Nothing to summarise yet', tc: '尚無可摘要內容', sc: '尚无可摘要内容' },
  'exp.summary.head': { en: 'Body composition — {date}', tc: '身體組成 — {date}', sc: '身体组成 — {date}' },
  'exp.copied': { en: 'Summary copied', tc: '摘要已複製', sc: '摘要已复制' },
  'exp.select': { en: 'Summary selected — copy it from the text field', tc: '摘要已選取，請從文字框複製', sc: '摘要已选取，请从文本框复制' },

  /* ranges + groups */
  'range.day': { en: 'Days', tc: '日', sc: '日' },
  'range.week': { en: 'Weeks', tc: '週', sc: '周' },
  'range.month': { en: 'Months', tc: '月', sc: '月' },
  'range.year': { en: 'Years', tc: '年', sc: '年' },
  'range.noun': { en: 'range', tc: '範圍', sc: '范围' },
  'group.composition': { en: 'Composition', tc: '體組成', sc: '体组成' },
  'group.muscle': { en: 'Muscle', tc: '肌肉', sc: '肌肉' },
  'group.fat': { en: 'Fat', tc: '脂肪', sc: '脂肪' },
  'group.water': { en: 'Water', tc: '水分', sc: '水分' },
  'group.energy': { en: 'Energy', tc: '能量', sc: '能量' },
  'group.risk': { en: 'Risk', tc: '風險', sc: '风险' },

  /* charts */
  'chart.nodata': { en: 'No data in this range', tc: '此範圍沒有數據', sc: '此范围没有数据' },
  'chart.noreadings': { en: 'No readings in this range', tc: '此範圍沒有讀數', sc: '此范围没有读数' },
  'chart.covering': { en: '{p} point{s} covering {n} readings', tc: '{p} 點，共 {n} 筆讀數', sc: '{p} 点，共 {n} 笔读数' },
  'chart.count': { en: '{p} reading{s}', tc: '{p} 筆讀數', sc: '{p} 笔读数' },

  /* report popup */  'popup.title': { en: 'Report image', tc: '報告圖像', sc: '报告图像' },  'popup.rendering': { en: 'Rendering the report…', tc: '正在繪製報告…', sc: '正在绘制报告…' },
  'popup.fail': { en: 'The report image could not be rendered.', tc: '無法繪製報告圖像。', sc: '无法绘制报告图像。' },
  'popup.details': { en: 'View details', tc: '查看詳情', sc: '查看详情' },
  'popup.download': { en: 'Download PNG', tc: '下載 PNG', sc: '下载 PNG' },
  'popup.close': { en: 'Close', tc: '關閉', sc: '关闭' },
  'popup.downloaded': { en: 'Report image downloaded', tc: '報告圖像已下載', sc: '报告图像已下载' },
};

/** Metric catalogue labels. Falls back to the English catalogue in metrics.ts. */
const METRIC_LABEL: Record<string, DictEntry> = {
  weight: { en: 'Weight', tc: '體重', sc: '体重' },
  bodyFat: { en: 'Body fat', tc: '體脂', sc: '体脂' },
  muscleMass: { en: 'Muscle mass', tc: '肌肉量', sc: '肌肉量' },
  fatFreeMass: { en: 'Fat-free mass', tc: '去脂體重', sc: '去脂体重' },
  bodyWater: { en: 'Body water', tc: '身體水分', sc: '身体水分' },
  boneMass: { en: 'Bone mass', tc: '骨量', sc: '骨量' },
  visceralFat: { en: 'Visceral fat', tc: '內臟脂肪', sc: '内脏脂肪' },
  bmi: { en: 'BMI', tc: 'BMI', sc: 'BMI' },
  bmr: { en: 'BMR', tc: '基礎代謝率', sc: '基础代谢率' },
  metabolicAge: { en: 'Metabolic age', tc: '代謝年齡', sc: '代谢年龄' },
  muscleQuality: { en: 'Muscle quality', tc: '肌肉質量', sc: '肌肉质量' },
  physiqueRating: { en: 'Physique rating', tc: '體型評分', sc: '体型评分' },
  sarcopenicIndex: { en: 'Sarcopenic index', tc: '肌少症指數', sc: '肌少症指数' },
  skeletalMuscleMass: { en: 'Skeletal muscle', tc: '骨骼肌量', sc: '骨骼肌量' },
  fatMass: { en: 'Fat mass', tc: '脂肪量', sc: '脂肪量' },
  totalBodyWaterKg: { en: 'Total body water', tc: '總身體水分', sc: '总身体水分' },
  intracellularWater: { en: 'Intracellular water', tc: '細胞內水分', sc: '细胞内水分' },
  extracellularWater: { en: 'Extracellular water', tc: '細胞外水分', sc: '细胞外水分' },
  ecwTbwRatio: { en: 'ECW/TBW ratio', tc: 'ECW/TBW 比', sc: 'ECW/TBW 比' },
  degreeOfObesity: { en: 'Degree of obesity', tc: '肥胖度', sc: '肥胖度' },
  muscleRatio: { en: 'Muscle ratio', tc: '肌肉率', sc: '肌肉率' },
  bodyIndex: { en: 'Body index', tc: '身體指數', sc: '身体指数' },
  muscleScore: { en: 'Muscle score', tc: '肌肉評分', sc: '肌肉评分' },
  legMuscleScore: { en: 'Leg muscle score', tc: '腿部肌肉評分', sc: '腿部肌肉评分' },
  segMuscleTrunk: { en: 'Trunk muscle', tc: '軀幹肌肉', sc: '躯干肌肉' },
  segMuscleLeftArm: { en: 'Left arm muscle', tc: '左臂肌肉', sc: '左臂肌肉' },
  segMuscleRightArm: { en: 'Right arm muscle', tc: '右臂肌肉', sc: '右臂肌肉' },
  segMuscleLeftLeg: { en: 'Left leg muscle', tc: '左腿肌肉', sc: '左腿肌肉' },
  segMuscleRightLeg: { en: 'Right leg muscle', tc: '右腿肌肉', sc: '右腿肌肉' },
  segFatTrunk: { en: 'Trunk fat', tc: '軀幹脂肪', sc: '躯干脂肪' },
  segFatLeftArm: { en: 'Left arm fat', tc: '左臂脂肪', sc: '左臂脂肪' },
  segFatRightArm: { en: 'Right arm fat', tc: '右臂脂肪', sc: '右臂脂肪' },
  segFatLeftLeg: { en: 'Left leg fat', tc: '左腿脂肪', sc: '左腿脂肪' },
  segFatRightLeg: { en: 'Right leg fat', tc: '右腿脂肪', sc: '右腿脂肪' },
  segFatRateTrunk: { en: 'Trunk fat rate', tc: '軀幹脂率', sc: '躯干脂率' },
  segFatRateLeftArm: { en: 'Left arm fat rate', tc: '左臂脂率', sc: '左臂脂率' },
  segFatRateRightArm: { en: 'Right arm fat rate', tc: '右臂脂率', sc: '右臂脂率' },
  segFatRateLeftLeg: { en: 'Left leg fat rate', tc: '左腿脂率', sc: '左腿脂率' },
  segFatRateRightLeg: { en: 'Right leg fat rate', tc: '右腿脂率', sc: '右腿脂率' },
  segMuscleBalanceTrunk: { en: 'Trunk muscle balance', tc: '軀幹肌肉平衡', sc: '躯干肌肉平衡' },
  segMuscleBalanceLeftArm: { en: 'Left arm muscle balance', tc: '左臂肌肉平衡', sc: '左臂肌肉平衡' },
  segMuscleBalanceRightArm: { en: 'Right arm muscle balance', tc: '右臂肌肉平衡', sc: '右臂肌肉平衡' },
  segMuscleBalanceLeftLeg: { en: 'Left leg muscle balance', tc: '左腿肌肉平衡', sc: '左腿肌肉平衡' },
  segMuscleBalanceRightLeg: { en: 'Right leg muscle balance', tc: '右腿肌肉平衡', sc: '右腿肌肉平衡' },
  segFatBalanceTrunk: { en: 'Trunk fat balance', tc: '軀幹脂肪平衡', sc: '躯干脂肪平衡' },
  segFatBalanceLeftArm: { en: 'Left arm fat balance', tc: '左臂脂肪平衡', sc: '左臂脂肪平衡' },
  segFatBalanceRightArm: { en: 'Right arm fat balance', tc: '右臂脂肪平衡', sc: '右臂脂肪平衡' },
  segFatBalanceLeftLeg: { en: 'Left leg fat balance', tc: '左腿脂肪平衡', sc: '左腿脂肪平衡' },
  segFatBalanceRightLeg: { en: 'Right leg fat balance', tc: '右腿脂肪平衡', sc: '右腿脂肪平衡' },
};

/** Report section labels. Falls back to REPORT_SECTION_LABELS. */
const SECTION_LABEL: Record<string, DictEntry> = {
  metadata: { en: 'Report metadata', tc: '報告元數據', sc: '报告元数据' },
  user_profile: { en: 'Subject profile', tc: '個人資料', sc: '个人资料' },
  key_indicators: { en: 'Key indicators', tc: '主要指標', sc: '主要指标' },
  body_composition: { en: 'Body composition', tc: '身體組成', sc: '身体组成' },
  reference_ranges: { en: 'Reference ranges', tc: '參考範圍', sc: '参考范围' },
  assessments: { en: 'Assessments', tc: '評估', sc: '评估' },
  segmental_analysis: { en: 'Segmental analysis', tc: '分段分析', sc: '分段分析' },
};

/** Report field labels. Falls back to REPORT_FIELD_LABELS, then humanised key. */
const FIELD_LABEL: Record<string, DictEntry> = {
  test_date: { en: 'Test date', tc: '測試日期', sc: '测试日期' },
  facility_name: { en: 'Facility', tc: '設施名稱', sc: '设施名称' },
  serial_number: { en: 'Serial number', tc: '序號', sc: '序号' },
  device_brand: { en: 'Device brand', tc: '裝置品牌', sc: '设备品牌' },
  age: { en: 'Age', tc: '年齡', sc: '年龄' },
  gender: { en: 'Gender', tc: '性別', sc: '性别' },
  gender_code: { en: 'Gender code', tc: '性別代碼', sc: '性别代码' },
  height_cm: { en: 'Height', tc: '身高', sc: '身高' },
  weight_kg: { en: 'Weight', tc: '體重', sc: '体重' },
  clothing_weight_kg: { en: 'Clothing weight', tc: '衣物重量', sc: '衣物重量' },
  bmi: { en: 'BMI', tc: 'BMI', sc: 'BMI' },
  metabolic_age: { en: 'Metabolic age', tc: '代謝年齡', sc: '代谢年龄' },
  visceral_fat_rating: { en: 'Visceral fat rating', tc: '內臟脂肪指數', sc: '内脏脂肪指数' },
  visceral_fat_status: { en: 'Visceral fat status', tc: '內臟脂肪狀態', sc: '内脏脂肪状态' },
  sarcopenic_index_smi: { en: 'Sarcopenic index (SMI)', tc: '肌少症指數 (SMI)', sc: '肌少症指数 (SMI)' },
  skeletal_muscle_mass_kg: { en: 'Skeletal muscle mass (SMM)', tc: '骨骼肌量 (SMM)', sc: '骨骼肌量 (SMM)' },
  physique_rating: { en: 'Physique rating', tc: '體型', sc: '体型' },
  physique_rating_score: { en: 'Physique rating score', tc: '體型評分', sc: '体型评分' },
  muscle_quality_score: { en: 'Muscle quality', tc: '肌肉質量', sc: '肌肉质量' },
  body_type_code: { en: 'Body type code', tc: '體型代碼', sc: '体型代码' },
  muscle_score: { en: 'Muscle score', tc: '肌肉評分', sc: '肌肉评分' },
  body_index: { en: 'Body index', tc: '身體指數', sc: '身体指数' },
  fat_percentage: { en: 'Fat percentage', tc: '體脂率', sc: '体脂率' },
  fat_mass_kg: { en: 'Fat mass', tc: '脂肪量', sc: '脂肪量' },
  muscle_mass_kg: { en: 'Muscle mass', tc: '肌肉量', sc: '肌肉量' },
  fat_free_mass_kg: { en: 'Fat-free mass (FFM)', tc: '去脂體重 (FFM)', sc: '去脂体重 (FFM)' },
  bone_mass_kg: { en: 'Bone mass', tc: '骨量', sc: '骨量' },
  protein_mass_kg: { en: 'Protein mass', tc: '蛋白質量', sc: '蛋白质量' },
  total_body_water_kg: { en: 'Total body water (TBW)', tc: '總身體水分 (TBW)', sc: '总身体水分 (TBW)' },
  total_body_water_percent: { en: 'Total body water', tc: '總身體水分率', sc: '总身体水分率' },
  intracellular_water_kg: { en: 'Intracellular water (ICW)', tc: '細胞內水分 (ICW)', sc: '细胞内水分 (ICW)' },
  extracellular_water_kg: { en: 'Extracellular water (ECW)', tc: '細胞外水分 (ECW)', sc: '细胞外水分 (ECW)' },
  ecw_tbw_ratio_percent: { en: 'ECW/TBW', tc: 'ECW/TBW 比', sc: 'ECW/TBW 比' },
  degree_of_obesity_percent: { en: 'Degree of obesity', tc: '肥胖度', sc: '肥胖度' },
  muscle_ratio_percent: { en: 'Muscle ratio', tc: '肌肉率', sc: '肌肉率' },
  bmr_kcal: { en: 'BMR', tc: '基礎代謝率', sc: '基础代谢率' },
  bmr_kj: { en: 'BMR', tc: '基礎代謝率', sc: '基础代谢率' },
  body_fat_percent: { en: 'Body fat reference', tc: '體脂參考', sc: '体脂参考' },
  standard: { en: 'Standard', tc: '標準值', sc: '标准值' },
  lower: { en: 'Lower reference', tc: '參考下限', sc: '参考下限' },
  upper: { en: 'Upper reference', tc: '參考上限', sc: '参考上限' },
  water_balance_block: { en: 'Water balance block', tc: '水分平衡', sc: '水分平衡' },
  bmr_block: { en: 'BMR block', tc: '代謝區塊', sc: '代谢区块' },
  visceral_fat_block: { en: 'Visceral fat block', tc: '內臟脂肪區塊', sc: '内脏脂肪区块' },
  leg_muscle_score: { en: 'Leg muscle score', tc: '腿部肌肉評分', sc: '腿部肌肉评分' },
  lower_body_muscle_balance: { en: 'Lower-body muscle balance', tc: '下肢肌肉平衡', sc: '下肢肌肉平衡' },
  upper_body_muscle_balance: { en: 'Upper-body muscle balance', tc: '上肢肌肉平衡', sc: '上肢肌肉平衡' },
  muscle_balance_scores: { en: 'Muscle balance scores', tc: '肌肉平衡評分', sc: '肌肉平衡评分' },
  fat_balance_scores: { en: 'Fat balance scores', tc: '脂肪平衡評分', sc: '脂肪平衡评分' },
  trunk: { en: 'Trunk', tc: '軀幹', sc: '躯干' },
  left_arm: { en: 'Left arm', tc: '左臂', sc: '左臂' },
  right_arm: { en: 'Right arm', tc: '右臂', sc: '右臂' },
  left_leg: { en: 'Left leg', tc: '左腿', sc: '左腿' },
  right_leg: { en: 'Right leg', tc: '右腿', sc: '右腿' },
  muscle_mass: { en: 'Muscle mass', tc: '肌肉量', sc: '肌肉量' },
  fat_mass: { en: 'Fat mass', tc: '脂肪量', sc: '脂肪量' },
  trunk_kg: { en: 'Trunk', tc: '軀幹', sc: '躯干' },
  left_arm_kg: { en: 'Left arm', tc: '左臂', sc: '左臂' },
  right_arm_kg: { en: 'Right arm', tc: '右臂', sc: '右臂' },
  left_leg_kg: { en: 'Left leg', tc: '左腿', sc: '左腿' },
  right_leg_kg: { en: 'Right leg', tc: '右腿', sc: '右腿' },
  trunk_percent: { en: 'Trunk', tc: '軀幹', sc: '躯干' },
  left_arm_percent: { en: 'Left arm', tc: '左臂', sc: '左臂' },
  right_arm_percent: { en: 'Right arm', tc: '右臂', sc: '右臂' },
  left_leg_percent: { en: 'Left leg', tc: '左腿', sc: '左腿' },
  right_leg_percent: { en: 'Right leg', tc: '右腿', sc: '右腿' },
};

/** Browser language mapped onto our three supported languages. */
export function systemLang(): AppLang {
  const tag = (navigator.language || 'en').toLowerCase();
  if (tag.startsWith('zh')) {
    if (/zh-(hans|cn|sg|my)/.test(tag)) return 'sc';
    return 'tc';
  }
  return 'en';
}

/** The effective UI language: explicit setting, or the system default. */
export function resolveAppLang(): AppLang {
  const setting = Settings.get().lang;
  if (setting === 'en' || setting === 'tc' || setting === 'sc') return setting;
  return systemLang();
}

/** BCP-47 tag for Intl formatters. */
export function appLocaleTag(): string {
  const lang = resolveAppLang();
  return lang === 'tc' ? 'zh-Hant' : lang === 'sc' ? 'zh-Hans' : 'en';
}

/** Translate a key, interpolating {vars}. Falls back to English, then the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = STR[key];
  const lang = resolveAppLang();
  let text = entry ? entry[lang] ?? entry.en : key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      text = text.split('{' + name + '}').join(String(vars[name]));
    }
  }
  return text;
}

/** Metric catalogue label in the UI language. */
export function metricLabel(key: string, fallback: string): string {
  const entry = METRIC_LABEL[key];
  if (!entry) return fallback;
  return entry[resolveAppLang()] ?? fallback;
}

/** Report section label in the UI language. */
export function sectionLabel(key: string, fallback: string): string {
  const entry = SECTION_LABEL[key];
  if (!entry) return fallback;
  return entry[resolveAppLang()] ?? fallback;
}

/** Report field label in the UI language. */
export function fieldLabel(key: string, fallback: string): string {
  const entry = FIELD_LABEL[key];
  if (!entry) return fallback;
  return entry[resolveAppLang()] ?? fallback;
}

/** Reading-source label in the UI language. */
export function sourceLabel(source: string, fallback: string): string {
  const entry = STR['source.' + source];
  if (!entry) return fallback;
  return entry[resolveAppLang()] ?? fallback;
}

/** Trend group label in the UI language. */
export function groupLabel(id: string, fallback: string): string {
  const entry = STR['group.' + id];
  if (!entry) return fallback;
  return entry[resolveAppLang()] ?? fallback;
}

/** Trend range label in the UI language. */
export function rangeLabel(id: string, fallback: string): string {
  const entry = STR['range.' + id];
  if (!entry) return fallback;
  return entry[resolveAppLang()] ?? fallback;
}

const VIEW_ID_TO_KEY: Record<string, string> = {
  'view-dashboard': 'view.dashboard',
  'view-trends': 'view.trends',
  'view-history': 'view.history',
  'view-settings': 'view.settings',
  'view-detail': 'view.detail'
};

/** Swaps every static string in index.html into the current language. */
export function applyI18n(): void {
  const lang = resolveAppLang();
  document.documentElement.lang = lang === 'en' ? 'en' : lang === 'tc' ? 'zh-Hant' : 'zh-Hans';

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (!key) return;
    // Metric catalogue labels live in their own table (see metricLabel).
    if (key.startsWith('metric.')) {
      node.textContent = metricLabel(key.slice(7), node.textContent || '');
      return;
    }
    node.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((node) => {
    const key = node.getAttribute('data-i18n-ph');
    if (key) (node as HTMLInputElement).placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria');
    if (key) node.setAttribute('aria-label', t(key));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    const key = node.getAttribute('data-i18n-title');
    if (key) node.setAttribute('title', t(key));
  });
  // The router reads data-title for the top-bar heading, so it travels too.
  for (const id of Object.keys(VIEW_ID_TO_KEY)) {
    const section = document.getElementById(id);
    if (section) section.dataset.title = t(VIEW_ID_TO_KEY[id]);
  }
}
