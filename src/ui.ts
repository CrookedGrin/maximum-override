import './ui.css'

document.getElementById('save').onclick = () => {
  parent.postMessage({ pluginMessage: { type: 'save-props' } }, '*')
}

document.getElementById('apply').onclick = () => {
  parent.postMessage({ pluginMessage: { type: 'apply-props' } }, '*')
}

// On load
parent.postMessage({ pluginMessage: { type: 'save-props' } }, '*');

onmessage = (event) => {
  console.log("received", event.data.pluginMessage);
}
