{ pkgs ? import <nixpkgs> {}
, API_ORIGIN ? "http://api.gradedescent.com"
, API_V1_PATH ? "/v1"
}:

let
  lib = pkgs.lib;
  buildNpmPackage = pkgs.buildNpmPackage;
  nodejs = pkgs.nodejs_20;
in
buildNpmPackage rec {
  pname = "gradedescent-frontend";
  version = "0.1.0";
  src = ./.;

  inherit nodejs;

  # Update with the hash from `nix build` if/when deps change.
  npmDepsHash = "sha256-tp+QzVsik2b61k2BcFSiv/5isCcXPDA4axtFQdTvgtg=";

  env = {
    NEXT_TELEMETRY_DISABLED = "1";

    # Your runtime config (available to Next build/server)
    inherit API_ORIGIN API_V1_PATH;
  };

  # Build uses dev deps (e.g., favicon generation), so include them in the cache.
  npmFlags = [ "--include=dev" ];

  nativeBuildInputs = [
    pkgs.makeWrapper
  ];

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/node_modules/${pname}"
    cp -r .next public package.json next.config.ts "$out/lib/node_modules/${pname}/"
    cp -r node_modules "$out/lib/node_modules/${pname}/"
    runHook postInstall
  '';

  postInstall = ''
    mkdir -p "$out/bin"
    makeWrapper "$out/lib/node_modules/${pname}/node_modules/.bin/next" \
      "$out/bin/gradedescent-frontend" \
      --chdir "$out/lib/node_modules/${pname}" \
      --add-flags "start"
  '';

  meta = with lib; {
    description = "GradeDescent frontend (Next.js)";
    license = licenses.agpl3Only;
    platforms = platforms.linux;
  };
}
