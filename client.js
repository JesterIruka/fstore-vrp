onNet('fivemstore-title', (title, subtitle) => {
  const name = GetCurrentResourceName();
  SendNuiMessage(JSON.stringify({ title, subtitle, name }));
  SetNuiFocus(true, false);
});

RegisterNuiCallbackType("removeFocus");
on("__cfx_nui:removeFocus", (data, cb) => {
  SetNuiFocus(false, false);
  cb(true);
});