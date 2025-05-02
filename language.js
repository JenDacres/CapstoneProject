
function translatePage(lang = "en") {
    const t = translations[lang] || translations.en;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (t[key]) {
            if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
                el.placeholder = t[key];
            } else {
                el.textContent = t[key];
            }
        }
    });
}

// language.js
let currentLang = localStorage.getItem('lang') || 'en';

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    translatePage();
}

function translatePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = translations[currentLang][key];
        if (translation) {
            if (el.tagName.toLowerCase() === 'input') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
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

// Initialize translation on page load
document.addEventListener('DOMContentLoaded', () => {
    translatePage();
});
