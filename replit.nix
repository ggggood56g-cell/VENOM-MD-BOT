{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.libwebp
    pkgs.libuuid
    pkgs.imagemagick
    pkgs.ffmpeg
  ];
  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.libuuid ];
  };
}
