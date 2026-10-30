/* Botão "voltar ao topo": aparece depois de rolar uma tela. Usado em todas as páginas. */
(function () {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "volta-topo";
  b.setAttribute("aria-label", "Voltar ao topo");
  b.innerHTML = '<span aria-hidden="true">↑</span>';
  b.hidden = true;
  b.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  document.body.appendChild(b);
  var marcar = function () { b.hidden = window.scrollY < window.innerHeight * 0.8; };
  window.addEventListener("scroll", marcar, { passive: true });
  marcar();
})();
