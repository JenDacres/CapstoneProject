let currentLang = sessionStorage.getItem('lang') || 'en';

function setLanguage(lang) {
    currentLang = lang;
    sessionStorage.setItem('lang', lang);
    translatePage();
}

function translatePage() {
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach(el => {
    const key = el.getAttribute("data-i18n");
    const translated = translateText(key);
    
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = translated;
    } else if (el.tagName === "OPTION") {
      el.textContent = translated;
    } else {
      el.innerText = translated;
    }
  });
}


function translateText(key, params = {}) {
    let text = translations[currentLang][key] || key;
    Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, params[param]);
    });
    return text;
}

document.addEventListener('DOMContentLoaded', () => {
    translatePage();
});
