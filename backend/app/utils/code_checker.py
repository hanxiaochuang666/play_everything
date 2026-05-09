import re


DANGEROUS_PATTERNS = [
    (r"os\.system\s*\(", "危险调用: os.system"),
    (r"subprocess\.(call|Popen|run)\s*\(", "危险调用: subprocess"),
    (r"__import__\s*\(\s*['\"]os['\"]\s*\)", "危险调用: 动态导入os模块"),
    (r"eval\s*\(", "危险调用: eval"),
    (r"exec\s*\(", "危险调用: exec"),
    (r"import\s+ctypes", "危险调用: ctypes模块"),
    (r"open\s*\(\s*['\"]/(?!workspace)", "危险调用: 访问根目录文件"),
    (r"socket\.socket\s*\(", "危险调用: 网络socket"),
    (r"requests\.(get|post|put|delete)\s*\(", "潜在风险: HTTP请求"),
    (r"urllib\.request", "潜在风险: HTTP请求"),
    (r"\bscp\b", "危险命令: scp"),
    (r"\bwget\b", "潜在风险: 文件下载"),
    (r"\bcurl\b", "潜在风险: 文件下载"),
]


def scan_code(code: str) -> list[str]:
    warnings = []
    for pattern, message in DANGEROUS_PATTERNS:
        if re.search(pattern, code, re.IGNORECASE):
            warnings.append(message)
    return warnings
