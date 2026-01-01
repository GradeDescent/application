# shell.nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_20
    pkgs.prisma-engines_7
    pkgs.openssl  # often needed by Node/Prisma
  ];

  # Prisma on NixOS: point to engines provided by nixpkgs
  PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/schema-engine";
  PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
  PRISMA_FMT_BINARY           = "${pkgs.prisma-engines}/bin/prisma-fmt";

  # Since we aren't using Prisma's hosted binaries, skip the checksum fetch:
  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
}

