seabunnies.register({name: 'Coin Hack', creator: 'MuffinGDYT'}, function() {
  document.body.addEventListener('keydown', event => {
    switch (event.key) {
      case '0': coins = 100000000000000; break;
      case '1': coins = 0; break;
      default: coins++; break;
    }
  });
});

// you can use this as a template