// Pantalla cuando no se pudieron LEER los datos al arrancar (red caída, sin sesión).
//
// Existe para no arrancar vacíos: con la lectura fallida la app hidrataba listas vacías y
// las marcaba como cargadas, y el primer cambio que se hacía después subía esa lista vacía
// (o de un solo elemento) encima de los datos reales. Mientras esta pantalla esté, nada se
// carga ni se guarda.
import { WifiOff, RefreshCw } from "lucide-react";
import { Button, Card } from "./ui.jsx";

interface LoadFailedProps {
  onRetry: () => void;
}

export default function LoadFailed({ onRetry }: LoadFailedProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-24 text-center">
      <Card className="w-full p-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <WifiOff className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-tight text-zinc-100">No pudimos cargar tus datos</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
          Revisá tu conexión y reintentá. Tus datos están a salvo: mientras esto no cargue, la app no guarda nada
          para no pisarlos.
        </p>
        <Button variant="bronze" Icon={RefreshCw} className="mt-5 w-full" onClick={onRetry}>
          Reintentar
        </Button>
      </Card>
    </div>
  );
}
