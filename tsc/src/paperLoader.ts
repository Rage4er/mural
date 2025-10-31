// paperLoader.ts
declare const self: any;

export function loadPaper(): any {
    // В веб-воркере paper должен быть доступен глобально
    if (typeof paper === 'undefined') {
        // Если paper не доступен, создаем заглушку для G-code рендеринга
        console.warn('Paper.js not available in worker - G-code preview may be limited');
        return {
            setup: () => {},
            project: {
                importJSON: () => ({ scale: () => {}, applyMatrix: true }),
                remove: () => {}
            },
            view: {
                draw: () => {}
            },
            Rectangle: class {
                constructor(x: number, y: number, width: number, height: number) {}
                contains(point: any): boolean { return true; }
            },
            Size: class {
                constructor(width: number, height: number) {}
            },
            Path: class {
                segments: any[] = [];
                closed: boolean = false;
                flatten() {}
            },
            Segment: class {
                point: any;
            }
        };
    }
    return paper;
}
