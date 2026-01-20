"use strict";
(() => {
  // src/ui.ts
  console.log("[UI] script loaded");
  var exportBtn = document.getElementById(
    "export-btn"
  );
  var exportPageBtn = document.getElementById(
    "export-page-btn"
  );
  var copyBtn = document.getElementById("copy-btn");
  var output = document.getElementById("output");
  var summaryMeta = document.getElementById(
    "summary-meta"
  );
  var platformSummary = document.getElementById(
    "platform-summary"
  );
  var statusSummary = document.getElementById(
    "status-summary"
  );
  var roleSummary = document.getElementById(
    "role-summary"
  );
  var componentTableBody = document.getElementById(
    "component-table-body"
  );
  console.log("[UI] elements:", {
    exportBtn,
    exportPageBtn,
    copyBtn,
    output,
    summaryMeta,
    platformSummary,
    statusSummary,
    roleSummary,
    componentTableBody
  });
  bindButton(exportBtn, () => {
    console.log("[UI] export ALL button clicked \u2192 sending export-components");
    parent.postMessage({ pluginMessage: { type: "export-components" } }, "*");
  });
  bindButton(exportPageBtn, () => {
    console.log(
      "[UI] export CURRENT PAGE button clicked \u2192 sending export-components-current-page"
    );
    parent.postMessage(
      { pluginMessage: { type: "export-components-current-page" } },
      "*"
    );
  });
  bindButton(copyBtn, () => {
    console.log("[UI] copy button clicked");
    if (!output) return;
    copyToClipboard(output.value).then(() => console.log("[UI] copied to clipboard")).catch((err) => console.error("[UI] failed to copy", err));
  });
  window.onmessage = (event) => {
    console.log("[UI] window.onmessage triggered:", event.data);
    const msg = event.data.pluginMessage;
    if (!msg) return;
    if (msg.type === "echo") {
      console.log("[UI] echo from code.ts:", msg);
    }
    if (msg.type === "export-result") {
      const payload = msg.payload;
      if (!payload) return;
      renderExportResult(payload);
    }
  };
  function bindButton(button, handler) {
    if (!button) return;
    button.onclick = handler;
  }
  function renderExportResult(payload) {
    if (output) {
      output.value = payload.json;
      console.log("[UI] textarea updated, length =", payload.json.length);
    }
    renderSummary(payload.data);
    renderComponents(payload.data.components);
  }
  function renderSummary(data) {
    if (summaryMeta) {
      summaryMeta.textContent = [
        `\u041A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B: ${data.components.length}`,
        `\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u044B: ${data.meta.files.length || 0}`,
        `\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: ${new Date(data.meta.generatedAt).toLocaleString()}`
      ].join(" \u2022 ");
    }
    updateCounts(platformSummary, buildCountMap(data.components, "platform"));
    updateCounts(statusSummary, buildCountMap(data.components, "status"));
    updateCounts(roleSummary, buildCountMap(data.components, "role"));
  }
  function renderComponents(components) {
    if (!componentTableBody) return;
    if (components.length === 0) {
      componentTableBody.innerHTML = '<tr><td colspan="5">\u041D\u0435\u0442 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432</td></tr>';
      return;
    }
    const rows = components.slice(0, 8).map((component) => {
      var _a, _b;
      const parentName = ((_b = (_a = component.parentComponent) == null ? void 0 : _a.name) == null ? void 0 : _b.trim()) || "\u2014";
      return `<tr>
      <td>${component.name}</td>
      <td>${component.platform}</td>
      <td>${component.role}</td>
      <td>${component.status}</td>
      <td>${parentName}</td>
    </tr>`;
    });
    componentTableBody.innerHTML = rows.join("");
  }
  function buildCountMap(components, key) {
    return components.reduce((acc, component) => {
      var _a;
      const value = component[key];
      acc[value] = ((_a = acc[value]) != null ? _a : 0) + 1;
      return acc;
    }, {});
  }
  function updateCounts(element, counts) {
    if (!element) return;
    const entries = Object.entries(counts);
    if (entries.length === 0) {
      element.textContent = "\u2014";
      return;
    }
    element.textContent = entries.map(([name, count]) => `${name}: ${count}`).join(" \u2022 ");
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }
})();
//# sourceMappingURL=ui.js.map
