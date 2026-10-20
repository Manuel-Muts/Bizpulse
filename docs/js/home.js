/* NAVIGATION LOGIC FOR LANDING PAGE */
const navLinks = document.querySelectorAll(".nav-links a[data-section]");
const navMenuToggle = document.getElementById("navMenuToggle");
const navLinksMenu = document.getElementById("navLinks");

function closeNavMenu() {
  if (!navMenuToggle || !navLinksMenu) return;
  navLinksMenu.classList.remove("open");
  navMenuToggle.setAttribute("aria-expanded", "false");
  navMenuToggle.setAttribute("aria-label", "Open navigation menu");
}

navMenuToggle?.addEventListener("click", () => {
  if (!navLinksMenu) return;
  const isOpen = navLinksMenu.classList.toggle("open");
  navMenuToggle.setAttribute("aria-expanded", String(isOpen));
  navMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
});

navLinksMenu?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", closeNavMenu);
});

document.addEventListener("click", event => {
  if (event.target.closest(".navbar")) return;
  closeNavMenu();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeNavMenu();
    navMenuToggle?.focus();
  }
});

navLinks.forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const sectionId = link.getAttribute('data-section');
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: "smooth" });
  });
});

/* FOOTER YEAR AUTOMATION */
document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("currentYear");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // Cookie Banner Logic
  const banner = document.getElementById("cookieBanner");
  const acceptBtn = document.getElementById("acceptCookies");

  if (banner && !localStorage.getItem("bizPulse_cookiesAccepted")) {
    banner.style.display = "flex";
  }

  acceptBtn?.addEventListener("click", () => {
    localStorage.setItem("bizPulse_cookiesAccepted", "true");
    banner.classList.add("fade-out");
    setTimeout(() => {
      banner.style.display = "none";
    }, 500); // Matches the 0.5s transition duration in CSS
  });
});