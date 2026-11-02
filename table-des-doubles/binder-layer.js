// Le diaporama est rendu dans <main>, qui est habituellement sous la barre de navigation.
// On le place temporairement au-dessus de celle-ci, puis on restitue l'ordre normal.
document.addEventListener('click', e => {
  if (e.target.closest('#binder-slide,[data-binder-card]')) {
    setTimeout(() => document.querySelector('main')?.style.setProperty('z-index', '1000'), 0);
  }
  if (e.target.closest('.binder-cinema-close')) {
    setTimeout(() => document.querySelector('main')?.style.removeProperty('z-index'), 0);
  }
});
