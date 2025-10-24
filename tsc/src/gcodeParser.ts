// gcodeParser.ts
import { Command } from './types';

export function parseGcodeToCommands(gcode: string, width: number, height: number): Command[] {
    const commands: Command[] = [];
    const lines = gcode.split('\n');
    
    let currentX = 0;
    let currentY = 0;
    let isPenDown = false;
    let absolutePositioning = true; // G90 по умолчанию
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith(';')) continue;
        
        const parts = trimmedLine.split(/\s+/);
        const gCommand = parts.find(p => p.startsWith('G'));
        
        if (gCommand) {
            const gCode = parseInt(gCommand.substring(1));
            
            switch (gCode) {
                case 0:  // G0 - Rapid move (pen up)
                case 1:  // G1 - Linear move (pen down)
                    const penState = gCode === 0 ? false : true;
                    const x = parseCoord(parts, 'X', currentX, absolutePositioning);
                    const y = parseCoord(parts, 'Y', currentY, absolutePositioning);
                    
                    // Если состояние пера изменилось - добавляем команду
                    if (penState !== isPenDown) {
                        commands.push(penState ? 'p1' : 'p0');
                        isPenDown = penState;
                    }
                    
                    // Добавляем координаты если они изменились
                    if (x !== currentX || y !== currentY) {
                        commands.push({ x, y });
                        currentX = x;
                        currentY = y;
                    }
                    break;
                    
                case 90: // G90 - Absolute positioning
                    absolutePositioning = true;
                    break;
                    
                case 91: // G91 - Relative positioning  
                    absolutePositioning = false;
                    break;
                    
                case 2:  // G2 - Clockwise arc
                case 3:  // G3 - Counterclockwise arc
                    // Пока пропускаем дуги, можно добавить позже
                    console.warn('Arc commands (G2/G3) not yet supported');
                    break;
            }
        }
    }
    
    return commands;
}

function parseCoord(parts: string[], axis: string, current: number, absolute: boolean): number {
    const coordPart = parts.find(p => p.startsWith(axis));
    if (!coordPart) return current;
    
    const value = parseFloat(coordPart.substring(1));
    return absolute ? value : current + value;
}