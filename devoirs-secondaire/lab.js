// Simulation pédagogique déterministe : une boucle fermée est nécessaire au courant.
(() => {
  let closed = false;
  document.querySelectorAll('[data-predict]').forEach(button => {
    button.onclick = () => {
      document.querySelector('#lab-feedback').textContent = button.dataset.predict === 'no'
        ? 'Exact ! Un circuit ouvert interrompt le courant. Teste maintenant l’interrupteur.'
        : 'Pas dans ce circuit : la boucle doit être fermée pour que le courant circule. Teste l’interrupteur.';
    };
  });
  document.querySelector('#toggle-circuit').onclick = event => {
    closed = !closed;
    event.target.textContent = closed ? 'Ouvrir l’interrupteur' : 'Fermer l’interrupteur';
    event.target.setAttribute('aria-pressed', String(closed));
    document.querySelector('#switch-line').setAttribute('d', closed ? 'M180 35 L240 35' : 'M180 35 L236 10');
    document.querySelector('#bulb').setAttribute('fill', closed ? '#ffe070' : '#dde3e7');
    const observation = closed
      ? 'Circuit fermé : le courant circule dans la boucle, la lampe s’allume.'
      : 'Circuit ouvert : la boucle est interrompue, la lampe est éteinte.';
    document.querySelector('#circuit-title').textContent = observation;
    document.querySelector('#circuit-observation').textContent = observation;
  };
})();
