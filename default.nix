{ pkgs ? import <nixpkgs> {} }:

let
  lib = pkgs.lib;
  buildNpmPackage = pkgs.buildNpmPackage;
  nodejs = pkgs.nodejs_20;
  prismaEngines = pkgs.prisma-engines_7;
in
buildNpmPackage rec {
  pname = "gradedescent-backend";
  version = "0.1.0";
  src = ./.;

  inherit nodejs;

  # Update with the hash from `nix build` if/when deps change.
  npmDepsHash = "sha256-AQHNknSeK9y4J8YG4oB0VbNKhaSpXngE1U+du43PRjs=";

  # These env vars are important for BOTH generate-time and runtime Prisma behavior on NixOS.
  env = {
    PRISMA_SCHEMA_ENGINE_BINARY = "${prismaEngines}/bin/schema-engine";
    PRISMA_QUERY_ENGINE_LIBRARY = "${prismaEngines}/lib/libquery_engine.node";
    PRISMA_FMT_BINARY           = "${prismaEngines}/bin/prisma-fmt";
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
  };

  nativeBuildInputs = [
    pkgs.makeWrapper
  ];

  buildInputs = [
    prismaEngines
    pkgs.openssl
  ];

  # Generates Prisma client into node_modules during the build.
  preBuild = ''
    npm run prisma:generate
  '';

  # Add deterministic executables into $out/bin
  postInstall = ''
    mkdir -p "$out/bin"

    # 1) API entrypoint
    makeWrapper "${nodejs}/bin/node" "$out/bin/gradedescent-api" \
      --chdir "$out/lib/node_modules/${pname}" \
      --add-flags "./dist/index.js"

    # Ensure prisma.config.ts is present in the installed package root
    if [ -f "${src}/prisma.config.ts" ]; then
      cp -v "${src}/prisma.config.ts" "$out/lib/node_modules/${pname}/prisma.config.ts"
    fi

    # 2) Prisma CLI entrypoint (with correct engine env + cwd)
    makeWrapper "$out/lib/node_modules/${pname}/node_modules/.bin/prisma" \
      "$out/bin/gradedescent-prisma" \
      --chdir "$out/lib/node_modules/${pname}" \
      --set PRISMA_SCHEMA_ENGINE_BINARY "${prismaEngines}/bin/schema-engine" \
      --set PRISMA_QUERY_ENGINE_LIBRARY "${prismaEngines}/lib/libquery_engine.node" \
      --set PRISMA_FMT_BINARY "${prismaEngines}/bin/prisma-fmt" \
      --set PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING "1"

    # 3) Convenience wrapper for migrations:
    #    gradedescent-migrate deploy  ==> prisma migrate deploy
    cat > "$out/bin/gradedescent-migrate" <<'EOF'
    #!${pkgs.bash}/bin/bash
    set -euo pipefail
    exec "$(dirname "$0")/gradedescent-prisma" migrate "$@"
    EOF
    chmod +x "$out/bin/gradedescent-migrate"
  '';

  meta = with lib; {
    description = "GradeDescent backend API (Node.js + Express + Prisma + PostgreSQL)";
    license = licenses.agpl3Only;
    platforms = platforms.linux;
  };
}

