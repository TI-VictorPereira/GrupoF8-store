(function () {
  const busca = document.querySelector(".busca");
  const vazio = document.querySelector(".nav-vazio");
  const nav = document.querySelector(".nav");
  const abrir = document.querySelector(".nav-abrir");
  const todosLinks = Array.from(document.querySelectorAll(".nav-links a"));
  // Só as âncoras da própria página entram na busca e no destaque; os links para
  // outras páginas (outro guia) ficam de fora.
  const links = todosLinks.filter((a) => (a.getAttribute("href") || "").startsWith("#"));
  const tirarAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Busca no menu: filtra os links pelo texto.
  busca.addEventListener("input", () => {
    const q = tirarAcento(busca.value.trim());
    let algum = false;
    todosLinks.forEach((a) => {
      const ok = !q || tirarAcento(a.textContent).includes(q);
      a.hidden = !ok;
      algum = algum || ok;
    });
    document.querySelectorAll(".nav-grupo").forEach((g) => {
      g.hidden = !g.querySelector("a:not([hidden])");
    });
    vazio.hidden = algum;
  });

  // Link ativo conforme a rolagem (scroll spy).
  const alvos = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("ativo", a.getAttribute("href") === "#" + e.target.id));
      });
    },
    { rootMargin: "0px 0px -70% 0px" },
  );
  alvos.forEach((el) => observador.observe(el));

  // Menu móvel (gaveta).
  abrir.addEventListener("click", () => {
    const aberto = nav.classList.toggle("aberto");
    abrir.setAttribute("aria-expanded", String(aberto));
  });
  todosLinks.forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("aberto");
      abrir.setAttribute("aria-expanded", "false");
    }),
  );

  // Ampliar print (lightbox).
  const caixa = document.querySelector(".lightbox");
  const grande = caixa.querySelector("img");
  document.querySelectorAll("figure.print button").forEach((b) => {
    b.addEventListener("click", () => {
      const img = b.querySelector("img");
      grande.src = img.src;
      grande.alt = img.alt;
      caixa.classList.add("aberto");
    });
  });
  caixa.addEventListener("click", () => caixa.classList.remove("aberto"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") caixa.classList.remove("aberto");
  });

  // O link do guia do DP só aparece para quem tem o papel. É conveniência: quem
  // garante o acesso é a API, que recusa o resto.
  fetch("/api/auth/eu", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((eu) => {
      if (eu && (eu.papel === "dp" || eu.papel === "admin")) {
        document.querySelectorAll("[data-so-dp]").forEach((el) => (el.hidden = false));
      }
    })
    .catch(() => {});
})();
