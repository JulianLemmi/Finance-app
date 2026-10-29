import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FormFooter } from "./formFooter.jsx";

// Sin `globals`, testing-library no limpia solo entre tests.
afterEach(() => cleanup());

const montar = (props: Partial<Parameters<typeof FormFooter>[0]> = {}) => {
  const fns = { onCancel: vi.fn(), onSubmit: vi.fn(), onDelete: vi.fn() };
  const vista = render(<FormFooter canSubmit {...fns} {...props} />);
  return { ...fns, vista };
};

describe("FormFooter", () => {
  it("sin onDelete (alta) no muestra 'Eliminar'", () => {
    montar({ onDelete: undefined });
    expect(screen.queryByText("Eliminar")).toBeNull();
    expect(screen.queryByText("Guardar")).not.toBeNull();
  });

  it("Cancelar y Guardar llaman a lo suyo", () => {
    const { onCancel, onSubmit } = montar();
    fireEvent.click(screen.getByText("Cancelar"));
    fireEvent.click(screen.getByText("Guardar"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("el botón principal queda deshabilitado si no se puede guardar", () => {
    const { onSubmit } = montar({ canSubmit: false });
    const boton = screen.getByText("Guardar") as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("el texto del botón principal se puede cambiar", () => {
    montar({ submitLabel: "Agregar auto" });
    expect(screen.queryByText("Agregar auto")).not.toBeNull();
    expect(screen.queryByText("Guardar")).toBeNull();
  });

  describe("eliminar", () => {
    it("el primer click NO borra: pide confirmación", () => {
      const { onDelete } = montar();
      fireEvent.click(screen.getByText("Eliminar"));
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByText("¿Eliminar?")).not.toBeNull();
    });

    it("'Sí' borra, una sola vez", () => {
      const { onDelete } = montar();
      fireEvent.click(screen.getByText("Eliminar"));
      fireEvent.click(screen.getByText("Sí"));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("'No' vuelve atrás sin borrar", () => {
      const { onDelete } = montar();
      fireEvent.click(screen.getByText("Eliminar"));
      fireEvent.click(screen.getByText("No"));
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByText("¿Eliminar?")).toBeNull();
      expect(screen.queryByText("Eliminar")).not.toBeNull();
    });

    it("al reabrir el sheet (el pie se vuelve a montar) 'Eliminar' NO queda armado", () => {
      // El estado vivía en el sheet, que sigue montado con open={false}: la segunda vez
      // podía aparecer el "¿Eliminar?" puesto de la vez anterior.
      const { vista } = montar();
      fireEvent.click(screen.getByText("Eliminar"));
      expect(screen.queryByText("¿Eliminar?")).not.toBeNull();
      vista.unmount();
      montar();
      expect(screen.queryByText("¿Eliminar?")).toBeNull();
      expect(screen.queryByText("Eliminar")).not.toBeNull();
    });
  });
});
