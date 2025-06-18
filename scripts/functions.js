function importHTML(name) {
    fetch(`../html/${name}.html`)
        .then((res) => res.text())
        .then((html) => {
          document.getElementById(name).innerHTML = html;
        });
    
}
