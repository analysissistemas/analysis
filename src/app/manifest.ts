import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Controle de Cabos",
    short_name: "Cabos",
    description: "Consulta e registro de corte e lançamento de cabos em campo",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1c1c",
    theme_color: "#0f1c1c",
    icons: [
      { src: "/icone-app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-app-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
