-- Klect probe (Lua, run from Workspace > Console via bmd.readfile + loadstring)
local out = {}
out[#out+1] = "version=" .. tostring(resolve and resolve:GetVersionString() or "no resolve global")
local pm = resolve and resolve:GetProjectManager()
local proj = pm and pm:GetCurrentProject()
out[#out+1] = "project=" .. tostring(proj and proj:GetName())
out[#out+1] = "projects=" .. tostring(pm and table.concat(pm:GetProjectListInCurrentFolder() or {}, "|"))
print(table.concat(out, "  "))
