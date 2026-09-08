async function init() {
  const events = await window.agent.listEvents();
  const printers = await window.agent.listPrinters();

  const eventSelect = document.getElementById('event');
  events.forEach((ev) => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.event_name;
    eventSelect.appendChild(opt);
  });

  const printerSelect = document.getElementById('printer');
  printers.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.displayName || p.name;
    printerSelect.appendChild(opt);
  });
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const eventSelect = document.getElementById('event');
  const printerSelect = document.getElementById('printer');
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';

  try {
    await window.agent.completeSetup({
      eventId: Number(eventSelect.value),
      eventName: eventSelect.options[eventSelect.selectedIndex]?.textContent,
      printerName: printerSelect.value,
    });
  } catch (err) {
    errorEl.textContent = 'Gagal menyimpan setup — coba lagi.';
  }
});

init();