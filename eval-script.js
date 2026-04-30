const fs = require('fs');
let code = fs.readFileSync('src/pages/settings/center-settings-form-page.js', 'utf8');
code = code.replace(/import\s+.*?from\s+['\"].*?['\"];/gs, '');
code = code.replace(/export\s+/g, '');
code = code.replace(/if\s*\(document\.readyState\s*===\s*['"]loading['"]\)\s*{[\s\S]*?}\s*else\s*{[\s\S]*?}/, '');
// Stub getActionsHtml to return an empty string to keep it clean
code += '\nfunction getActionsHtml() { return ""; }\n';

function evalInContext() {
  eval(code);
  const schoolHtml = getSchoolFieldsHtml('');
  const hotelingHtml = getHotelingFieldsHtml('');
  fs.writeFileSync('school-html.txt', schoolHtml);
  fs.writeFileSync('hoteling-html.txt', hotelingHtml);
}
evalInContext();
