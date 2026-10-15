这个目录里的文件就是官网「下载」区的东西：

  YaoShiWo-Setup-1.2.0.exe          安装版（会创建桌面快捷方式、可卸载）
  YaoShiWo-portable.exe             免安装版（双击即用，适合放 U 盘）
  YaoShiWo-chrome-extension.zip     浏览器扩展（解压后用「加载已解压的扩展程序」装入）

它们是从打包产物复制过来并改了名的（扩展 zip 由 chrome-extension 目录打包而来）：

  release\YaoShiWo-Setup-1.2.0.exe  ->  download\YaoShiWo-Setup-1.2.0.exe
  release\YaoShiWo-portable.exe     ->  download\YaoShiWo-portable.exe
  chrome-extension\*                ->  download\YaoShiWo-chrome-extension.zip

以后出了新版本，重新复制一次（记得文件名里的版本号与 index.html 里的链接保持一致）。
