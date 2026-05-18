# 我的课表 PWA

一个纯前端的课程表 Web App，支持导入飞书 Excel 课表，手机/电脑离线查看。

## 功能

- **今天 / 明天 / 本周** 三个视图，一打开就看到今天的课
- **导入 Excel 即更新**：换学期、调课只需在设置里重新选 .xlsx 文件
- **离线可用**：装到主屏幕后，没网也能查
- **课前提醒**：导出 `.ics` 到系统日历（最可靠），或开浏览器通知（仅前台可靠）
- **数据本地存储**：完全在你的设备上，没有任何服务器

## 项目结构

```
├── index.html              # 主页（含 4 个视图）
├── styles.css              # 移动优先样式
├── manifest.webmanifest    # PWA 清单
├── sw.js                   # Service Worker（离线缓存）
├── js/
│   ├── app.js              # 入口：路由 + 视图渲染
│   ├── parser.js           # Excel → JSON 解析（核心）
│   ├── storage.js          # localStorage 封装
│   ├── scheduler.js        # 日期/周次换算 & 今日筛选
│   ├── notifications.js    # 浏览器通知 + .ics 导出
│   └── sw-register.js      # SW 注册
├── icons/                  # PWA 图标
└── vendor/xlsx.full.min.js # SheetJS（本地化，离线可用）
```

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库，比如 `class-schedule`
2. 在本目录下：
   ```bash
   git init
   git add .
   git commit -m "init class schedule pwa"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/class-schedule.git
   git push -u origin main
   ```
3. 仓库 → Settings → Pages → Source 选 `main` 分支 / root → Save
4. 等 1 分钟，访问 `https://<你的用户名>.github.io/class-schedule/`

## 在手机上安装（OPPO Find X9 Pro）

1. 用手机浏览器（Chrome / 自带浏览器）打开上面的网址
2. 浏览器菜单 → "添加到主屏幕" / "安装"
3. 主屏幕会出现「课表」图标，点开就是全屏 app
4. 第一次打开 → 「设置」→「选择 Excel 文件」→ 选课表 .xlsx
5. 完成！

## 日常使用

- 每天打开 app → 自动停留在「今天」→ 一眼看到课程时间、地点
- 课表更新了？→「设置」→ 选新 .xlsx → 自动覆盖旧数据

## 课前提醒

**推荐：导出到系统日历（最可靠）**
- 「设置」→「导出到系统日历 (.ics)」
- 下载到手机后点开 .ics 文件，OPPO 自带日历会自动询问导入
- 系统日历会在课前 30 分钟（可改）发原生提醒，不依赖 app 是否打开

**补充：浏览器通知（仅供参考）**
- 设置里开启即可
- 局限：app 必须保持在最近任务里，锁屏久了或浏览器被系统杀掉就失效

## Excel 格式假设

解析器假设课表 sheet 名为「课表」，结构形如：

- A 列偶尔出现月份标识：`2026.03 / March`
- B 列偶尔出现整数周次
- 周次行下方，D/F/H/J/L/N/P 列（即周一~周日数据列）按 [课程名 / 时间 / 教室] 三行排布
- 时间格式：`9:00-12:00` 或全角 `9：00-12：00`

边界 case（如周六考试错位）通过"以时间格式单元格为锚点，向上读课程名、向下读教室"的方式自动适配。

## 第 1 周日期推断

解析器从 March block 的第 1 周行读取周一所在列的日号（如 2026.03 第 1 周周一 = 3 月 2 日），由此推算整学期。
如果推断错误，可以在设置里手动改「第 1 周周一日期」。

## 已知限制

- Service Worker 需要 HTTPS（GitHub Pages 默认支持）；本地 `file://` 打开不会生效，需用 `python -m http.server` 等启动本地服务
- 浏览器后台通知不可靠，正式提醒请用 .ics 方案
- 当前只支持中法项目这种「网格 × 月份块」格式的 Excel

## 本地预览（开发用）

```bash
cd "D:\claudeProject\classSchedule"
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```
