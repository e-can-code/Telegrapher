package org.morsecomposer.foundation;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.view.View;
import android.view.WindowInsets;
import android.graphics.Color;
import android.util.Base64;
import android.content.ContentValues;
import android.provider.MediaStore;
import android.os.Build;
import java.io.*;
import java.util.*;

public class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> chooser;
  private Uri pendingIncoming;
  private boolean webReady=false;
  private int importRetries=0;
  private static final int PICK_FILE = 100;
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(7,29,21));
    getWindow().setNavigationBarColor(Color.rgb(7,29,21));
    web = new WebView(this);
    setContentView(web);
    // Respect Android system navigation without resizing the approved Compose instrument.
    // The WebView receives only the bottom system-bar inset when the window draws edge-to-edge.
    web.setOnApplyWindowInsetsListener((view, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.navigationBars());
        view.setPadding(0, 0, 0, bars.bottom);
      } else {
        view.setPadding(0, 0, 0, insets.getSystemWindowInsetBottom());
      }
      return insets;
    });
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);
    s.setMediaPlaybackRequiresUserGesture(true);
    web.addJavascriptInterface(new Bridge(),"AndroidFiles");
    web.setWebViewClient(new WebViewClient(){
      @Override public void onPageFinished(WebView view,String url){
        webReady=true;
        deliverIncoming();
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri=request.getUrl();
        if (!"appassets.androidplatform.net".equals(uri.getHost())) return null;
        String path=uri.getPath();
        if(path==null || !path.startsWith("/assets/"))return null;
        String rel=path.substring(8);
        if(rel.contains(".."))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
        if(rel.isEmpty())rel="index.html";
        try {
          InputStream stream=getAssets().open("www/"+rel);
          String mime=rel.endsWith(".js")?"text/javascript":rel.endsWith(".css")?"text/css":rel.endsWith(".svg")?"image/svg+xml":rel.endsWith(".json")||rel.endsWith(".webmanifest")?"application/json":rel.endsWith(".html")?"text/html":"application/octet-stream";
          return new WebResourceResponse(mime,"UTF-8",stream);
        } catch(IOException e){return null;}
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){
        if(chooser!=null)chooser.onReceiveValue(null);
        chooser=callback;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"audio/wav","audio/x-wav","audio/wave","application/octet-stream"});
        startActivityForResult(intent,PICK_FILE);return true;
      }
    });
    handleIncoming(getIntent());
    web.loadUrl(ORIGIN+"/assets/index.html");
  }
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleIncoming(intent);}
  private void handleIncoming(Intent intent){
    if(intent==null)return;
    Uri uri=intent.getData();
    if(uri==null && Intent.ACTION_SEND.equals(intent.getAction())){
      if(Build.VERSION.SDK_INT>=33)uri=intent.getParcelableExtra(Intent.EXTRA_STREAM,Uri.class);
      else uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }
    if(uri==null)return;
    pendingIncoming=uri;importRetries=0;
    deliverIncoming();
  }
  private void deliverIncoming(){
    if(!webReady||pendingIncoming==null)return;
    Uri uri=pendingIncoming;pendingIncoming=null;
    try{
      // Limit incoming payloads to protect the WebView and JavaScript bridge.
      ByteArrayOutputStream output=new ByteArrayOutputStream();
      try(InputStream input=getContentResolver().openInputStream(uri)){
        if(input==null)throw new IOException("Cannot read incoming audio");
        byte[] buffer=new byte[8192];int n;
        while((n=input.read(buffer))!=-1){
          if(output.size()+n>12*1024*1024)throw new IOException("WAV exceeds 12 MB import limit");
          output.write(buffer,0,n);
        }
      }
      byte[] bytes=output.toByteArray();
      if(bytes.length<12||bytes[0]!='R'||bytes[1]!='I'||bytes[2]!='F'||bytes[3]!='F'||bytes[8]!='W'||bytes[9]!='A'||bytes[10]!='V'||bytes[11]!='E')throw new IOException("Not a RIFF/WAVE recording");
      String name="Received message.wav";
      try(android.database.Cursor c=getContentResolver().query(uri,new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null)){
        if(c!=null&&c.moveToFirst()){String found=c.getString(0);if(found!=null&&!found.isEmpty())name=found;}
      }catch(Exception ignored){}
      String base64=Base64.encodeToString(bytes,Base64.NO_WRAP);
      String safeName=org.json.JSONObject.quote(name);
      String script="(function(){if(typeof window.morseOpenAndroidWav==='function'){window.morseOpenAndroidWav('"+base64+"',"+safeName+");return true;}return false;})()";
      web.evaluateJavascript(script,result->{
        if(!"true".equals(result) && ++importRetries<12){pendingIncoming=uri;web.postDelayed(this::deliverIncoming,250);}
      });
    }catch(Exception error){
      runOnUiThread(()->android.widget.Toast.makeText(this,"Cannot import WAV: "+error.getMessage(),android.widget.Toast.LENGTH_LONG).show());
    }
  }
  @Override protected void onActivityResult(int req,int result,Intent data){
    super.onActivityResult(req,result,data);
    if(req==PICK_FILE && chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);chooser=null;}
  }
  @Override public void onBackPressed(){web.evaluateJavascript("(function(){const d=[...document.querySelectorAll('dialog[open]')];if(d.length){d[d.length-1].close();return true;}return false;})()",result->{if(!"true".equals(result))web.evaluateJavascript("document.querySelector('[data-workspace=compose]')?.click()",null);});}
  public class Bridge {
    @JavascriptInterface public void saveWav(String name,String base64){
      try {
        byte[] data=Base64.decode(base64,Base64.DEFAULT);
        String safe=name.replaceAll("[^a-zA-Z0-9._-]","_");
        if(!safe.toLowerCase(Locale.ROOT).endsWith(".wav"))safe+=".wav";
        ContentValues values=new ContentValues();values.put(MediaStore.Downloads.DISPLAY_NAME,safe);values.put(MediaStore.Downloads.MIME_TYPE,"audio/wav");
        if(Build.VERSION.SDK_INT>=29){values.put(MediaStore.Downloads.RELATIVE_PATH,"Download/MorseComposer");Uri u=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);if(u==null)throw new IOException("MediaStore insert failed");try(OutputStream out=getContentResolver().openOutputStream(u)){out.write(data);}}
        else {runOnUiThread(()->android.widget.Toast.makeText(MainActivity.this,"Use Android 10+ for direct WAV saving",android.widget.Toast.LENGTH_LONG).show());return;}
        runOnUiThread(()->android.widget.Toast.makeText(MainActivity.this,"Saved WAV to Downloads/MorseComposer",android.widget.Toast.LENGTH_SHORT).show());
      }catch(Exception e){runOnUiThread(()->android.widget.Toast.makeText(MainActivity.this,"WAV export failed",android.widget.Toast.LENGTH_LONG).show());}
    }
  }
}
