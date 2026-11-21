using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
public static class AsarPatch {
 static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=Int32.MaxValue,RecursionLimit=100};}
 static Dictionary<string,object> Dict(object x){return (Dictionary<string,object>)x;}
 static string Hash(byte[] b){using(var s=SHA256.Create())return BitConverter.ToString(s.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static void Walk(Dictionary<string,object> n,string prefix,List<KeyValuePair<string,Dictionary<string,object>>> list){
  foreach(var kv in Dict(n["files"])) {var e=Dict(kv.Value);string p=prefix+kv.Key;if(e.ContainsKey("files"))Walk(e,p+"/",list);else list.Add(new KeyValuePair<string,Dictionary<string,object>>(p,e));}
 }
 static byte[] Data(byte[] raw,int start,Dictionary<string,object> e){long off=Convert.ToInt64(e["offset"]);int len=Convert.ToInt32(e["size"]);if(off<0||len<0||start+off+len>raw.LongLength)throw new Exception("Invalid ASAR entry bounds");var b=new byte[len];Buffer.BlockCopy(raw,checked(start+(int)off),b,0,len);return b;}
 static void Put(Dictionary<string,object> n,string path){var parts=path.Split('/');for(int i=0;i<parts.Length;i++){var files=Dict(n["files"]);if(i==parts.Length-1){if(!files.ContainsKey(parts[i]))files[parts[i]]=new Dictionary<string,object>();return;}if(!files.ContainsKey(parts[i]))files[parts[i]]=new Dictionary<string,object>{{"files",new Dictionary<string,object>()}};n=Dict(files[parts[i]]);}}
 static object Integrity(byte[] b){var blocks=new List<string>();for(int i=0;i<b.Length;i+=4194304){int n=Math.Min(4194304,b.Length-i);var block=new byte[n];Buffer.BlockCopy(b,i,block,0,n);blocks.Add(Hash(block));}return new Dictionary<string,object>{{"algorithm","SHA256"},{"hash",Hash(b)},{"blockSize",4194304},{"blocks",blocks}};}
 public static string Patch(string original,string plugin,string output){
  byte[] raw=File.ReadAllBytes(original);if(raw.Length<16)throw new Exception("Invalid ASAR");int start=checked(8+BitConverter.ToInt32(raw,4)),length=BitConverter.ToInt32(raw,12);if(length<2||16L+length>raw.Length)throw new Exception("Invalid header");
  var header=Dict(Json().DeserializeObject(Encoding.UTF8.GetString(raw,16,length)));var entries=new List<KeyValuePair<string,Dictionary<string,object>>>();Walk(header,"",entries);
  var replacements=new Dictionary<string,byte[]>();string marker="<script type=\"module\" src=\"./xxgg-enhanced/panel.mjs\"></script>";bool found=false;
  foreach(var kv in entries)if(kv.Key=="dist/index.html") {string html=Encoding.UTF8.GetString(Data(raw,start,kv.Value));if(!html.Contains("</body>"))throw new Exception("Missing body");if(!html.Contains(marker))html=html.Replace("</body>",marker+"\n</body>");replacements[kv.Key]=Encoding.UTF8.GetBytes(html);found=true;}
  if(!found)throw new Exception("Missing index");
  foreach(string name in new[]{"engine.mjs","panel.mjs","panel.css","records.mjs","difficulty.mjs","calibration.mjs"}){string p="dist/xxgg-enhanced/"+name;replacements[p]=File.ReadAllBytes(Path.Combine(plugin,name));Put(header,p);}
  entries.Clear();Walk(header,"",entries);var chunks=new List<byte[]>();long offset=0;
  foreach(var kv in entries){var e=kv.Value;if(e.ContainsKey("unpacked")&&Convert.ToBoolean(e["unpacked"])||e.ContainsKey("link"))continue;byte[] bytes;if(!replacements.TryGetValue(kv.Key,out bytes))bytes=Data(raw,start,e);else e["integrity"]=Integrity(bytes);e["offset"]=offset.ToString(System.Globalization.CultureInfo.InvariantCulture);e["size"]=bytes.Length;chunks.Add(bytes);offset+=bytes.Length;}
  byte[] text=Encoding.UTF8.GetBytes(Json().Serialize(header));int padded=(4+text.Length+3)&~3;int pickle=4+padded;
  using(var w=new BinaryWriter(File.Create(output))){w.Write(4);w.Write(pickle);w.Write(padded);w.Write(text.Length);w.Write(text);for(int i=4+text.Length;i<padded;i++)w.Write((byte)0);foreach(var b in chunks)w.Write(b);}
  Verify(original,output,replacements);return Hash(File.ReadAllBytes(output)).ToUpperInvariant();
 }
 static void Verify(string original,string output,Dictionary<string,byte[]> replacements){
  byte[] old=File.ReadAllBytes(original),now=File.ReadAllBytes(output);int a=8+BitConverter.ToInt32(old,4),b=8+BitConverter.ToInt32(now,4);
  var oh=Dict(Json().DeserializeObject(Encoding.UTF8.GetString(old,16,BitConverter.ToInt32(old,12))));var nh=Dict(Json().DeserializeObject(Encoding.UTF8.GetString(now,16,BitConverter.ToInt32(now,12))));var ol=new List<KeyValuePair<string,Dictionary<string,object>>>();var nl=new List<KeyValuePair<string,Dictionary<string,object>>>();Walk(oh,"",ol);Walk(nh,"",nl);var lookup=new Dictionary<string,Dictionary<string,object>>();foreach(var kv in nl)lookup[kv.Key]=kv.Value;
  foreach(var kv in ol){if(!lookup.ContainsKey(kv.Key))throw new Exception("Missing original entry");var e=kv.Value;if(e.ContainsKey("unpacked")&&Convert.ToBoolean(e["unpacked"])||e.ContainsKey("link")){if(Json().Serialize(e)!=Json().Serialize(lookup[kv.Key]))throw new Exception("Unpacked entry changed");continue;}byte[] expected;if(!replacements.TryGetValue(kv.Key,out expected))expected=Data(old,a,e);if(Hash(expected)!=Hash(Data(now,b,lookup[kv.Key])))throw new Exception("Verification failed: "+kv.Key);}
  foreach(var kv in replacements)if(Hash(kv.Value)!=Hash(Data(now,b,lookup[kv.Key])))throw new Exception("Plugin verification failed");
 }
}
