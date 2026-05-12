use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    Emitter, Manager,
};

// ===== App Configuration =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub save_path: String,
}

fn get_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path.join("config.json"))
}

fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = get_config_path(app).unwrap();
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(config) = serde_json::from_str(&content) {
            return config;
        }
    }
    // Default path: Documents/arabp2p
    let docs_path = app.path().document_dir().unwrap_or_else(|_| PathBuf::from("C:\\"));
    AppConfig { save_path: docs_path.join("arabp2p").to_string_lossy().to_string() }
}

fn save_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app)?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

// ===== Torrent Commands =====

#[tauri::command]
fn get_save_path(app: tauri::AppHandle) -> Result<String, String> {
    let config = load_config(&app);
    Ok(config.save_path)
}

#[tauri::command]
fn set_save_path(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let target_dir = PathBuf::from(&path);
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }
    let config = AppConfig { save_path: path.clone() };
    save_config(&app, &config)?;
    Ok(path)
}

#[tauri::command]
fn get_torrent_count(save_path: String) -> Result<u32, String> {
    let target_dir = PathBuf::from(&save_path);
    if !target_dir.exists() {
        return Ok(0);
    }
    
    let count = fs::read_dir(&target_dir)
        .map_err(|e| e.to_string())?
        .filter(|entry| {
            entry.as_ref().ok().map(|e| {
                e.path().extension().map(|ext| ext == "torrent").unwrap_or(false)
            }).unwrap_or(false)
        })
        .count() as u32;
    
    Ok(count)
}

#[tauri::command]
fn save_torrent(save_path: String, file_name: String, file_content: Vec<u8>) -> Result<String, String> {
    let target_dir = PathBuf::from(&save_path);
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }
    
    let count = get_torrent_count(save_path.clone())?;
    let new_number = count + 1;
    let new_file_name = format!("{:02}.torrent", new_number);
    let new_file_path = target_dir.join(&new_file_name);
    
    fs::write(&new_file_path, file_content).map_err(|e| e.to_string())?;
    
    let names_file_path = target_dir.join("01_names.txt");
    let names_entry = format!("{}|{}\n", new_number, file_name);
    
    if names_file_path.exists() {
        let mut file = fs::OpenOptions::new()
            .append(true)
            .open(&names_file_path)
            .map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(names_entry.as_bytes()).map_err(|e| e.to_string())?;
    } else {
        fs::write(&names_file_path, names_entry).map_err(|e| e.to_string())?;
    }
    
    Ok(new_file_name)
}

#[tauri::command]
fn get_names_file(save_path: String) -> Result<String, String> {
    if save_path.is_empty() {
        return Ok(String::new());
    }
    let target_dir = PathBuf::from(&save_path);
    let names_file_path = target_dir.join("01_names.txt");
    
    if !names_file_path.exists() {
        return Ok(String::new());
    }
    
    let content = fs::read_to_string(&names_file_path).unwrap_or_default();
    Ok(content)
}

// ===== UserScript System Commands =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserScript {
    id: String,
    name: String,
    enabled: bool,
    matches: String,
    code: String,
    #[serde(rename = "createdAt")]
    created_at: f64,
    #[serde(rename = "updatedAt")]
    updated_at: f64,
}

fn get_scripts_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_local_data_dir()
        .map_err(|e| e.to_string())?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    let scripts_path = path.join("scripts.json");
    println!("Scripts path: {:?}", scripts_path);
    Ok(scripts_path)
}

#[tauri::command]
fn load_scripts(app: tauri::AppHandle) -> Result<Vec<UserScript>, String> {
    let path = get_scripts_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let scripts: Vec<UserScript> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(scripts)
}

#[tauri::command]
fn save_scripts(app: tauri::AppHandle, scripts: Vec<UserScript>) -> Result<(), String> {
    let path = get_scripts_path(&app)?;
    let content = serde_json::to_string_pretty(&scripts).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Inject a JavaScript snippet into the browser webview window via eval()
#[tauri::command]
fn inject_script(app: tauri::AppHandle, code: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("browser") {
        window.eval(&code).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Browser window is not open. Launch ArabP2P Browser from the Home tab first.".to_string())
    }
}

/// Get all enabled scripts that match the given URL
#[tauri::command]
fn get_matching_scripts(app: tauri::AppHandle, url: String) -> Result<Vec<String>, String> {
    let scripts = load_scripts(app.clone())?;
    let mut to_inject = Vec::new();

    println!("[Script Engine] Matching URL: {}", url);
    println!("[Script Engine] Database contains {} total scripts", scripts.len());

    for script in &scripts {
        if !script.enabled {
            continue;
        }

        println!("[Script Engine] Checking script '{}' (Match pattern: '{}')", script.name, script.matches);

        let patterns: Vec<&str> = script.matches.split(',').map(|p| p.trim()).collect();
        let should_run = patterns.iter().any(|p| {
            let matched = matches_url(p, &url);
            if matched {
                println!("[Script Engine] >> MATCH FOUND for script '{}' with pattern '{}'", script.name, p);
            }
            matched
        });

        if should_run {
            to_inject.push(script.code.clone());
        }
    }

    println!("[Script Engine] Found {} matching scripts total for this page", to_inject.len());
    Ok(to_inject)
}

/// Robust URL pattern matching (Tampermonkey style)
fn matches_url(pattern: &str, url: &str) -> bool {
    if pattern == "*" || pattern == "<all_urls>" {
        return true;
    }
    
    // 1. Normalize pattern: treat *.site.com as site.com internally (we make subdomain optional later)
    let p = pattern.replace("://www.", "://").replace("://*.", "://");

    // 2. Build regex string manually for maximum control
    let mut re_str = String::from("^");
    for c in p.chars() {
        match c {
            '*' => re_str.push_str(".*"),
            '.' => re_str.push_str("\\."),
            '/' => re_str.push_str("\\/"),
            '?' => re_str.push_str("."),
            ':' => re_str.push_str(":"),
            '(' | ')' | '[' | ']' | '{' | '}' | '+' | '^' | '$' | '|' | '\\' => {
                re_str.push('\\');
                re_str.push(c);
            }
            _ => re_str.push(c),
        }
    }

    // 3. Make "www." and any sub-domains optional after the protocol
    // This allows *://arabp2p.net/* to match both arabp2p.net and www.arabp2p.net
    // and also allows *://*.arabp2p.net/* to match the naked domain.
    let re_str = re_str.replace(":\\/\\/", ":\\/\\/(www\\.)?(.*\\.)?");
    
    // 4. Handle trailing slash and final anchor
    let final_re = if re_str.ends_with(".*") {
        re_str // If it ends with wildcard, no need for trailing slash flex
    } else {
        format!("{}\\/?$", re_str)
    };

    println!("[Script Engine] Debug: Pattern '{}' -> Regex '{}'", pattern, final_re);

    match regex_lite::Regex::new(&final_re) {
        Ok(re) => re.is_match(url),
        Err(e) => {
            println!("[Script Engine] ERROR: Failed to compile regex: {}", e);
            false
        }
    }
}

// ===== App Entry Point =====

#[tauri::command]
fn open_browser(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let url: tauri::Url = "https://www.arabp2p.net".parse().unwrap();
        let _ = window.navigate(url);
        let _ = window.set_focus();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .menu(|app| {
      let app_submenu = SubmenuBuilder::new(app, "ArabP2P")
        .text("home", "Home")
        .text("settings", "Settings")
        .text("scripts", "Scripts")
        .separator()
        .quit()
        .build()?;
      
      MenuBuilder::new(app)
        .item(&app_submenu)
        .build()
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Robust initialization script for Toast, Layout, and Dynamic Injection
      let init_js = r#"
        (function() {
          console.log('[ArabP2P] Bootstrapping Engine...');
          
          function applyLayout() {
            if (!window.location.hostname.includes('arabp2p')) return;
            const style = document.createElement('style');
            style.id = 'arabp2p-layout-fix';
            style.textContent = 'body { margin: 0 !important; padding: 0 !important; overflow-x: hidden !important; }';
            document.head.appendChild(style);
          }

          window.showArabP2PToast = (msg) => {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:30px;right:30px;background:#1e1e2e;color:#4ade80;padding:16px 28px;border-radius:14px;border:1px solid rgba(74,222,128,0.5);z-index:99999999;font-family:sans-serif;font-weight:bold;box-shadow:0 10px 40px rgba(0,0,0,0.8);display:flex;align-items:center;gap:12px;opacity:1;transition:all 0.4s;';
            toast.innerHTML = '<span style="font-size:20px">✅</span> ' + msg;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(10px)"; }, 3500);
            setTimeout(() => toast.remove(), 4000);
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyLayout);
          } else {
            applyLayout();
          }
        })();
      "#;

      // Create the main window manually with the initialization script
      let _window = tauri::WebviewWindowBuilder::new(
        app,
        "main",
        tauri::WebviewUrl::App("index.html".into())
      )
      .title("ArabP2P")
      .inner_size(1200.0, 800.0)
      .min_inner_size(800.0, 600.0)
      .center()
      .initialization_script(init_js)
      .on_page_load(|window, payload| {
        let url = payload.url().to_string();
        println!("[Script Engine] Page Event: {:?} on URL: {}", payload.event(), url);
        
        if payload.event() == tauri::webview::PageLoadEvent::Finished {
            if url.contains("arabp2p.net") {
                let app = window.app_handle();
                match get_matching_scripts(app.clone(), url.clone()) {
                    Ok(scripts) => {
                        println!("[Script Engine] Found {} matching scripts for {}", scripts.len(), url);
                        for code in scripts {
                            let wrapped = format!(
                                r#"(function() {{ 
                                    console.log('[ArabP2P] Executing UserScript...');
                                    try {{ 
                                        {} 
                                    }} catch(e) {{ 
                                        console.error('[UserScript Error]', e); 
                                    }} 
                                }})();"#,
                                code
                            );
                            let _ = window.eval(&wrapped);
                        }
                    },
                    Err(e) => println!("[Script Engine] Error loading scripts: {}", e),
                }
            }
        }
      })
      .on_download(|window, event| {
        match event {
          tauri::webview::DownloadEvent::Requested { url, destination } => {
            // Check if the download is from ArabP2P
            let url_str = url.to_string();
            let is_arabp2p = url.host_str().map(|h| h.contains("arabp2p")).unwrap_or(false) 
                          || url_str.contains("arabp2p.net");

            if is_arabp2p {
              let app = window.app_handle();
              let config = load_config(app);
              let target_dir = PathBuf::from(&config.save_path);
              
              if !target_dir.exists() {
                let _ = fs::create_dir_all(&target_dir);
              }
              
              // Get the filename suggested by the webview
              let original_filename = destination.file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| {
                    url.path_segments()
                      .and_then(|s| s.last())
                      .unwrap_or("download.torrent")
                      .to_string()
                });
              
              // Get next number for the file prefix
              let count = get_torrent_count(config.save_path.clone()).unwrap_or(0);
              let new_number = count + 1;
              let final_filename = format!("{:02}_{}", new_number, original_filename);
              
              // Set the destination to your custom folder with NUMBER + ORIGINAL filename
              let full_path = target_dir.join(&final_filename);
              *destination = full_path;
              
              println!("[Download] Intercepted: {} -> {:?}", final_filename, destination);
            }
          }
          tauri::webview::DownloadEvent::Finished { success, .. } => {
            if success {
              // Show notification on the page itself
              let _ = window.eval("if(window.showArabP2PToast) window.showArabP2PToast('Torrent Downloaded Successfully!');");
              // Also emit event to frontend (Home tab)
              let _ = window.emit("download-finished", "Success");
            }
          }
          _ => {}
        }
        true // Allow the download to proceed
      })
      .build()?;

      Ok(())
    })
    .on_menu_event(|app, event| {
      let base_url = if cfg!(debug_assertions) {
          "http://localhost:1420"
      } else {
          #[cfg(windows)]
          let url = "http://tauri.localhost";
          #[cfg(not(windows))]
          let url = "tauri://localhost";
          url
      };

      match event.id().as_ref() {
        "home" => {
          if let Some(window) = app.get_webview_window("main") {
            let url: tauri::Url = "https://arabp2p.net".parse().unwrap();
            let _ = window.navigate(url);
          }
        }
        "settings" => {
          if let Some(window) = app.get_webview_window("main") {
            let url: tauri::Url = format!("{}/#/settings", base_url).parse().unwrap();
            let _ = window.navigate(url);
          }
        }
        "scripts" => {
          if let Some(window) = app.get_webview_window("main") {
            let url: tauri::Url = format!("{}/#/scripts", base_url).parse().unwrap();
            let _ = window.navigate(url);
          }
        }
        _ => {}
      }
    })
    .invoke_handler(tauri::generate_handler![
        get_save_path,
        set_save_path,
        get_torrent_count,
        save_torrent,
        get_names_file,
        inject_script,
        get_matching_scripts,
        open_browser,
        load_scripts,
        save_scripts,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
