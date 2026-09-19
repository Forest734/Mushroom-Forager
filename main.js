const button = document.querySelector("#ping");
const output = document.querySelector("#output");

let count = 0;
button.addEventListener("click", () => {
  count += 1;
  output.textContent = `pong ×${count} — ${new Date().toLocaleTimeString()}`;
});
