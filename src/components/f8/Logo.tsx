import logoF8 from "@/assets/logo-f8.png.asset.json";

export function LogoF8({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <img
      src={logoF8.url}
      alt="Grupo F8"
      className={`${className} rounded-lg object-contain`}
    />
  );
}
