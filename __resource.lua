resource_manifest_version '05cfa83c-a124-4cfa-a768-c24a5811d8f9'

dependency {
	"yarn",
	"vrp"
}

ui_page "nui/index.html"

files {
	"nui/index.html",
	"nui/index.css"
}

client_scripts {
	"client.js"
}

server_scripts {
	"@vrp/lib/utils.lua",
	"server.lua", 
	"server.js"
}