const fs = require('fs');
const schoolHtml = fs.readFileSync('school-html.txt', 'utf8').trim();
const hotelingHtml = fs.readFileSync('hoteling-html.txt', 'utf8').trim();

function updateHtmlFile(file, actionHtml) {
        let content = fs.readFileSync('src/pages/settings/' + file, 'utf8');
        const inject = `
        <div data-school-fields hidden>
${schoolHtml}
        </div>
        <div data-hoteling-fields hidden>
${hotelingHtml}
        </div>
${actionHtml}
      </form>`;
        content = content.replace('</form>', inject);
        fs.writeFileSync('src/pages/settings/' + file, content);
}

updateHtmlFile('center-settings-form.html', `
        <div class="center-settings-form__actions">
          <button class="primary-button" type="submit">등록</button>
        </div>`);

updateHtmlFile('center-settings-detail.html', `
        <div class="center-settings-form__actions">
          <button class="primary-button" type="submit">저장</button>
        </div>`);

console.log('HTML files updated successfully.');
