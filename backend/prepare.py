"""Prepare private course payloads and public route wrappers; never run on production."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
web=root/'zhixu'
files={'p6-standard':'p6-standard.html','p6-higher':'p6-higher.html',**{f's{n}-{kind}':f's{n}-{kind}.html' for n in range(1,4) for kind in ('express','higher')},'s4-express':'s4.html','s4-higher':'s4-higher.html','essay-training':'essay.html','psle-review':'psle/index.html','legacy-review':'review.html'}
# Refuse to overwrite an already-prepared checkout.
for path in files.values():
 if 'location.replace(' in (web/path).read_text():
  raise SystemExit('Already prepared. Use the original base checkout to rebuild protected content.')
assets=[]
for asset,path in files.items():
 source=web/path
 html=source.read_text()
 scripts=[]
 def script(m):
  src=m.group(1).split('?')[0]
  scripts.append('<script>'+ (source.parent/src).read_text().replace('</script','<\\/script')+'</script>')
  return ''
 html=re.sub(r'<script[^>]+src="([^"]+)"[^>]*></script>',script,html)
 html=re.sub(r'<link[^>]+href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>',lambda m:'<style>'+(source.parent/m.group(1).split('?')[0]).read_text()+'</style>',html)
 base='https://zhixueducation.github.io/zhixu-learning-lab/zhixu/'+('psle/' if path.startswith('psle/') else '')
 html=html.replace('<head>','<head><base target="_top" href="'+base+'">',1)
 html=html.replace('</body>',''.join(scripts)+'</body>')
 allowed=['p6-standard','p6-higher'] if asset=='psle-review' else list(files)[:11] if asset=='legacy-review' else [asset]
 assets.append({'asset_id':asset,'allowed_courses':allowed,'html':html})
 # Keep the existing URL, but fetch the protected content only after server validation.
 portal='../portal.html' if path.startswith('psle/') else 'portal.html'
 source.write_text('<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知序｜请登录</title><script>location.replace('+json.dumps(portal+'?course='+asset)+');</script><p>请先<a href="'+portal+'?course='+asset+'">登录知序</a>进入课程。</p></html>')
# Remove exposed data copies after bundling. These remain recoverable from Git history.
for name in ['essay-data.js','essay-more.js','essay.js','psle/psle-review-data.js','psle/psle-review.js']:
 (web/name).unlink()
(root/'backend/course-content.json').write_text(json.dumps(assets,ensure_ascii=False))
# Payload file is generated for the authorized deployment step and must never be pushed to public GitHub.
(root/'backend/course-content.sql').write_text("insert into zx_private.course_content(asset_id,allowed_courses,html) select x.asset_id,array(select jsonb_array_elements_text(x.allowed_courses)),x.html from jsonb_to_recordset($zhixu$"+json.dumps(assets,ensure_ascii=False)+"$zhixu$::jsonb) as x(asset_id text,allowed_courses jsonb,html text);")
print(f'Prepared {len(assets)} protected course assets.')
