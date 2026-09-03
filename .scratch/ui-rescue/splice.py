import io

target = "apps/web/src/index.css"
chunk = open(".scratch/ui-rescue/shared.css", encoding="utf-8").read()
s = open(target, encoding="utf-8").read()

marker = "@media (max-width: 48rem) {"
assert marker in s, "media marker missing"
assert ".panel {" not in s, "already spliced"
s = s.replace(marker, chunk + marker, 1)

extra = """
  .engine-layout,
  .component-card {
    grid-template-columns: 1fr;
  }

  .component-identity {
    border-right: 0;
    border-bottom: 1px solid #d8dee4;
  }

  .builder-save {
    align-items: stretch;
    text-align: left;
  }
"""
s = s.rstrip()
assert s.endswith("}")
s = s[:-1].rstrip() + "\n" + extra + "}\n"
open(target, "w", encoding="utf-8").write(s)
print("spliced")
