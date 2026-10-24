type PaletteEntry = {
  group: string;
  className: string;
  title: string;
  action: {
    click: (event: Event) => void;
    dragstart: (event: Event) => void;
  };
};

type PaletteProvider = {
  getPaletteEntries: () => Record<string, PaletteEntry>;
};

type Palette = {
  registerProvider: (priority: number, provider: PaletteProvider) => void;
};

type ElementFactory = {
  createShape: (attributes: { type: string }) => unknown;
};

type Create = {
  start: (event: Event, element: unknown) => void;
};

type EventBus = {
  fire: (eventName: string, data: { sourceEvent: Event }) => void;
};

class TaskChooserPaletteProvider {
  static $inject = ['palette', 'create', 'elementFactory', 'eventBus'];

  constructor(
    palette: Palette,
    create: Create,
    elementFactory: ElementFactory,
    eventBus: EventBus,
  ) {
    palette.registerProvider(500, {
      getPaletteEntries: () => ({
        'create.task': {
          group: 'activity',
          className: 'bpmn-icon-task',
          title: 'Create task',
          action: {
            dragstart: (event) => {
              create.start(
                event,
                elementFactory.createShape({ type: 'bpmn:Task' }),
              );
            },
            click: (event) => {
              eventBus.fire('taskChooser.toggle', { sourceEvent: event });
            },
          },
        },
      }),
    });
  }
}

export const taskChooserPaletteModule = {
  __init__: ['taskChooserPaletteProvider'],
  taskChooserPaletteProvider: ['type', TaskChooserPaletteProvider],
};
