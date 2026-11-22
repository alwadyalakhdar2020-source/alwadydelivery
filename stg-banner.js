// Test environment marker: shown on every page of the staging site only.
(function () {
  function add() {
    if (document.getElementById("stg-banner")) return;
    var b = document.createElement("div");
    b.id = "stg-banner"; b.setAttribute("role", "status");
    b.textContent = "⚠ بيئة اختبار — بيانات تجريبية، أي شي هنا ما يأثر على المنصة الفعلية";
    b.style.cssText = "position:fixed;inset-inline:0;bottom:0;z-index:2147483647;background:#F39235;color:#051D48;font:700 13px/1.6 Tajawal,Tahoma,sans-serif;text-align:center;padding:4px 8px;pointer-events:none;direction:rtl";
    document.body.appendChild(b);
  }
  if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
})();
