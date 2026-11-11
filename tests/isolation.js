let keys = 0, inputs = 0;
document.addEventListener('keydown', () => { document.getElementById('keys').textContent = `宿主网页捕获键盘事件：${++keys}`; }, true);
document.addEventListener('input', () => { document.getElementById('inputs').textContent = `宿主网页捕获输入事件：${++inputs}`; }, true);
