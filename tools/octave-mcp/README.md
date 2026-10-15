# Octave MCP Server

يربط Claude Code بـ GNU Octave عبر بروتوكول MCP.

## المتطلبات
- GNU Octave مثبت وعلى PATH
- Python 3.8+
- مكتبة `mcp`: `pip install mcp`

## الإعداد

### 1. تنزيل الملف
احفظ `octave_mcp_server.py` في مجلد ثابت، مثلاً:
```
C:\Users\<username>\octave-mcp\octave_mcp_server.py
```

### 2. ربطه بـ Claude Code
```powershell
claude mcp add --transport stdio octave -- python "C:\Users\<username>\octave-mcp\octave_mcp_server.py"
```

### 3. التحقق
```powershell
claude mcp list
```

## الأدوات المتاحة
| الأداة | الوصف |
|--------|-------|
| `evaluate_octave_code` | تشغيل كود Octave مباشرة |
| `run_octave_file` | تشغيل ملف .m |
| `detect_octave_version` | إصدار Octave والـ toolboxes |
| `check_octave_available` | التحقق من وجود octave-cli |
