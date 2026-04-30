const seabunnies = {
  register(info, func) {
    let confirmed = confirm(`Run ${info.name} by ${info.creator}?`);
    if (confirmed) func();
  }
};

function getModURL() {
  const url = prompt('Enter mod URL here. Some URLs may not work');
  if (!(url == null)) {
    fetch(url).then(res => res.text()).then(data => {
      eval(data);
    }).catch(err => {
      alert(`An error was returned: ${err}`);
    })
  }
}