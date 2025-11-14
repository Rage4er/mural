// paperLoader.ts
import paper from 'paper';

export function loadPaper() {
    // Упрощаем загрузку paper без process
    if (typeof window !== 'undefined' && (window as any).paper) {
        return (window as any).paper;
    }
    return paper;
}