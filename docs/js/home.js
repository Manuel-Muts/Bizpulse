/* NAVIGATION LOGIC FOR LANDING PAGE */
const navLinks = document.querySelectorAll(".nav-links a[data-section]");

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