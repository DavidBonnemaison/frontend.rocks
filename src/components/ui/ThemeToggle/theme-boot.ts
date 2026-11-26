export const THEME_STORAGE_KEY = 'fr-theme';

export const THEME_BOOT_SCRIPT =
  "try{if(localStorage.getItem('fr-theme')==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}";
