local Proxy = module("vrp", "lib/Proxy")
vRP = Proxy.getInterface("vRP")

local function load_code(code, environment)
  if setfenv and loadstring then
      local f = assert(loadstring(code))
      setfenv(f,environment)
      return f
  else
      return assert(load(code, nil,"t",environment))
  end
end


AddEventHandler('fivemstore-lua', function (exec, callback)
  local context = {}
  context.vRP = vRP

  local condition = load_code("return " .. exec, context);

  callback(condition())
end)