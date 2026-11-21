param([string]$InstallDir='',[switch]$Restore,[switch]$NonInteractive)
$ErrorActionPreference='Stop'
function ReadJson($p){Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json}
function SaveJson($p,$v){[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 30),(New-Object Text.UTF8Encoding($false)))}
try {
 $manifest=ReadJson "$PSScriptRoot\compatibility.json"
 if(!$InstallDir){foreach($candidate in @($PSScriptRoot,(Split-Path $PSScriptRoot -Parent))){if(Test-Path -LiteralPath (Join-Path $candidate 'resources\app.asar')){$InstallDir=$candidate;break}}}
 if(!$InstallDir){throw '请完整解压，将插件文件夹放到九分学长主程序 exe 旁边，再双击安装。'}
 $InstallDir=(Resolve-Path -LiteralPath $InstallDir).Path
 if(!(Test-Path -LiteralPath (Join-Path $InstallDir '九分学长考雅机考平台.exe'))){throw '目录中没有九分学长主程序。'}
 if(Get-Process -Name '九分学长考雅机考平台' -ErrorAction SilentlyContinue){throw '请保存进度并正常退出九分学长后再安装。'}
 $app=Join-Path $InstallDir 'resources\app.asar';$stateFile=Join-Path $InstallDir 'resources\smart-practice-public.json'
 $current=(Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash
 $state=$null;if(Test-Path -LiteralPath $stateFile){$state=ReadJson $stateFile}
 if($Restore){
  if(!$state){throw '没有找到此安装器的还原记录。'}
  if($state.installedHash -ne $current){throw '程序已更新或被修改，停止还原，避免覆盖新版本。'}
  $backupRoot=[IO.Path]::GetFullPath((Join-Path $InstallDir 'smart-practice-backups'))+[IO.Path]::DirectorySeparatorChar
  $previous=[IO.Path]::GetFullPath($state.backup)
  if(!$previous.StartsWith($backupRoot,[StringComparison]::OrdinalIgnoreCase)){throw '备份路径不属于本安装目录。'}
  if((Get-FileHash -LiteralPath $previous -Algorithm SHA256).Hash -ne $state.previousHash){throw '备份文件校验失败。'}
  Copy-Item -LiteralPath $previous -Destination $app -Force
  if((Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash -ne $state.previousHash){throw '还原校验失败。'}
  $priorState=Join-Path (Split-Path $previous -Parent) 'previous-installer-state.json'
  if(Test-Path -LiteralPath $priorState){Copy-Item -LiteralPath $priorState -Destination $stateFile -Force}else{Remove-Item -LiteralPath $stateFile}
  Write-Host '已还原安装前程序；学习记录未回滚。'
 }else{
  foreach($file in $manifest.files.PSObject.Properties){
   if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file.Name) -Algorithm SHA256).Hash -ne $file.Value){throw ('插件文件校验失败：'+$file.Name)}
  }
  if($state -and $state.installedHash -eq $current -and $state.pluginVersion -eq $manifest.pluginVersion){Write-Host '此版本已安装。';exit 0}
  if($current -notin $manifest.acceptedHashes -and !($state -and $state.installedHash -eq $current -and $state.appVersion -eq $manifest.appVersion)){throw '程序版本或文件不匹配。此包仅适配 0.9.21-rc.3。请等待新版本适配。'}
  $backupDir=Join-Path $InstallDir ('smart-practice-backups\'+(Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $backup=Join-Path $backupDir 'app.asar';Copy-Item -LiteralPath $app -Destination $backup
  if((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $current){throw '原程序备份校验失败。'}
  $data=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'xxgg-electron'
  foreach($sub in @('Local Storage','IndexedDB','Session Storage')){$source=Join-Path $data $sub;if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $backupDir -Recurse}}
  if($state){Copy-Item -LiteralPath $stateFile -Destination (Join-Path $backupDir 'previous-installer-state.json')}
  Add-Type -Path "$PSScriptRoot\tools\AsarPatch.cs" -ReferencedAssemblies 'System.Web.Extensions'
  $stage=Join-Path $InstallDir 'resources\app.smart-practice-staging.asar'
  $enhancedHash=[AsarPatch]::Patch($app,(Join-Path $PSScriptRoot 'plugin'),$stage)
  $newState=@{pluginVersion=$manifest.pluginVersion;appVersion=$manifest.appVersion;installedHash=$enhancedHash;previousHash=$current;backup=$backup}
  SaveJson (Join-Path $backupDir 'installation.json') $newState
  try{[IO.File]::Replace($stage,$app,(Join-Path $backupDir 'atomic-original.asar'));SaveJson $stateFile $newState}catch{Copy-Item -LiteralPath $backup -Destination $app -Force;throw}
  Write-Host '智能组题助手安装成功。打开九分学长，点击右下角“智能练习”。'
  Write-Host ('备份位置：'+$backupDir)
 }
}catch{Write-Host ('操作停止：'+$_.Exception.Message) -ForegroundColor Red;if(!$NonInteractive){Read-Host '按回车退出'};exit 1}
if(!$NonInteractive){Read-Host '按回车关闭'}
