export type Language = 'en' | 'ru';

export interface StudioCopy {
  pageTitle: string;
  pageDescription: string;
  brandCaption: string;
  languageSwitcher: string;
  switchToEnglish: string;
  switchToRussian: string;
  descriptionStep: string;
  describeProcess: string;
  clearText: string;
  clearTextTitle: string;
  nothingToClearTitle: string;
  processingDocument: string;
  importDocument: string;
  importNote: string;
  chooseDocument: string;
  descriptionPlaceholder: string;
  descriptionAria: string;
  designingAria: string;
  loginToGenerateAria: string;
  importingDocument: string;
  designingProcess: string;
  generateDiagram: string;
  loginWithGoogle: string;
  modelBuildingProgress: string;
  documentBuildingProgress: string;
  generationError: string;
  refinementErrorFallback: string;
  documentErrorFallback: string;
  validatorTitle: string;
  finishScenario: string;
  finishScenarioTitle: string;
  chatEmptyFirstLine: string;
  chatEmptySecondLine: string;
  refiningDiagram: string;
  replyPlaceholder: string;
  replyAria: string;
  questions: readonly string[];
  fallbackTaskName: string;
  finishedByUser: string;
  footerWorkflow: string;
  resizeTitle: string;
  resizeAria: string;
  canvasTitle: string;
  canvasReady: string;
  canvasSummary: (nodes: number, flows: number) => string;
  databaseButton: string;
  validatorTooltip: string;
  unlimitedAccess: string;
  unlimited: string;
  freeQuota: (count: number) => string;
  logout: string;
  authPrompt: string;
  authChecking: string;
  clearCanvas: string;
  validated: string;
  waitingForValidator: string;
  bpmnDrawing: string;
  sqlTitle: string;
  sqlDescription: string;
  copied: string;
  copySql: string;
  close: string;
  tasks: string;
  gateways: string;
  closeTaskChooser: string;
  closeGatewayChooser: string;
  rollback: string;
  task: string;
  taskDescription: string;
  userTask: string;
  userTaskDescription: string;
  serviceTask: string;
  serviceTaskDescription: string;
  exclusiveGateway: string;
  exclusiveGatewayDescription: string;
  parallelGateway: string;
  parallelGatewayDescription: string;
  eventBasedGateway: string;
  eventBasedGatewayDescription: string;
  renderError: string;
  exportXmlError: string;
  exportSvgError: string;
  exportBpmn: string;
  exportSvg: string;
  specGenerating: string;
  specGenerate: string;
  specDownloadMarkdown: string;
  specDownloadWord: string;
  specTooltip: string;
  specErrorTitle: string;
  specErrorMessage: string;
  closeError: string;
  errorBoundaryTitle: string;
  errorBoundaryDescription: string;
  tryAgain: string;
  notFoundTitle: string;
  notFoundDescription: string;
}

const english: StudioCopy = {
  pageTitle: 'Text-to-BPMN Studio',
  pageDescription: 'Create and edit BPMN 2.0 process diagrams from text descriptions.',
  brandCaption: 'Process modeling studio',
  languageSwitcher: 'Interface language',
  switchToEnglish: 'Switch interface language to English',
  switchToRussian: 'Switch interface language to Russian',
  descriptionStep: 'STEP 01 · DESCRIPTION',
  describeProcess: 'Describe the business process',
  clearText: 'Clear text',
  clearTextTitle: 'Clear the description, chat, and error message',
  nothingToClearTitle: 'Nothing to clear: all text fields are already empty',
  processingDocument: 'Processing document…',
  importDocument: 'Import document',
  importNote: 'DOCX, TXT · up to 5 MB',
  chooseDocument: 'Choose a DOCX or TXT file',
  descriptionPlaceholder: 'For example: A customer submits a request, a manager reviews it and, if everything is correct, sends it to fulfillment…',
  descriptionAria: 'Process description',
  designingAria: 'AI is designing the process',
  loginToGenerateAria: 'Sign in with Google to generate a diagram',
  importingDocument: 'Importing document…',
  designingProcess: 'AI is designing the process…',
  generateDiagram: 'Generate diagram',
  loginWithGoogle: 'Sign in with Google',
  modelBuildingProgress: 'The model is building the diagram. Please keep this page open.',
  documentBuildingProgress: 'Extracting text and building the diagram…',
  generationError: 'Could not build the diagram. The model may be busy. Please try again later.',
  refinementErrorFallback: 'Could not update the diagram. The original diagram is preserved. Please clarify your response and try again.',
  documentErrorFallback: 'Could not import the document. Check the file format and try again.',
  validatorTitle: 'AI validator',
  finishScenario: 'Finish scenario',
  finishScenarioTitle: 'The scenario may be finished with errors',
  chatEmptyFirstLine: 'Questions and suggestions about',
  chatEmptySecondLine: 'the generated diagram will appear here',
  refiningDiagram: 'Updating the diagram from your clarification…',
  replyPlaceholder: 'Your response…',
  replyAria: 'Reply to the validator',
  questions: [
    'I drafted the basic process. What should happen if “{{task}}” fails: should the process end, or should the customer be notified?',
    'The diagram is ready. Should “{{task}}” include an additional data check before moving to the next step?',
    'The process logic is clear. Should responsible staff be notified automatically after “{{task}}” is completed?',
  ],
  fallbackTaskName: 'this step',
  finishedByUser: 'Scenario finished by the user',
  footerWorkflow: 'LOGIC · DIAGRAM · EXPORT',
  resizeTitle: 'Drag to resize the panel',
  resizeAria: 'Resize sidebar',
  canvasTitle: 'Diagram canvas',
  canvasReady: 'Ready to build a process',
  canvasSummary: (nodes, flows) => `${nodes} elements · ${flows} flows`,
  databaseButton: 'Database schema',
  validatorTooltip: 'Answer the AI validator’s question to confirm the process logic, or finish the scenario manually',
  unlimitedAccess: 'Unlimited access',
  unlimited: 'Unlimited',
  freeQuota: (count) => `Free: ${count}`,
  logout: 'Sign out',
  authPrompt: 'Sign in to generate',
  authChecking: 'Checking sign-in…',
  clearCanvas: 'Clear canvas',
  validated: 'LOGIC VALIDATED',
  waitingForValidator: 'WAITING FOR VALIDATOR REVIEW',
  bpmnDrawing: 'BPMN 2.0 DIAGRAM',
  sqlTitle: 'Database schema',
  sqlDescription: 'DDL generated from the current BPMN diagram',
  copied: 'Copied',
  copySql: 'Copy SQL',
  close: 'Close',
  tasks: 'Tasks',
  gateways: 'Gateways',
  closeTaskChooser: 'Close task chooser',
  closeGatewayChooser: 'Close gateway chooser',
  rollback: 'Undo',
  task: 'Task',
  taskDescription: 'A general process task',
  userTask: 'User task',
  userTaskDescription: 'Work performed by a person',
  serviceTask: 'Service task',
  serviceTaskDescription: 'Automated work performed by a service or system',
  exclusiveGateway: 'Exclusive gateway',
  exclusiveGatewayDescription: 'Routes the flow down one path based on data',
  parallelGateway: 'Parallel gateway',
  parallelGatewayDescription: 'Splits the flow into parallel paths or joins them',
  eventBasedGateway: 'Event-based gateway',
  eventBasedGatewayDescription: 'Follows whichever event occurs first',
  renderError: 'Could not display the diagram. Check the diagram structure.',
  exportXmlError: 'Could not export BPMN. Make sure a diagram has been created.',
  exportSvgError: 'Could not export SVG. Make sure a diagram has been created.',
  exportBpmn: 'Download BPMN (XML)',
  exportSvg: 'Download SVG',
  specGenerating: 'Writing specification…',
  specGenerate: 'Generate specification',
  specDownloadMarkdown: 'Download as Markdown (.md)',
  specDownloadWord: 'Download as Word (.docx)',
  specTooltip: 'Answer the AI validator’s question to confirm the process logic, or finish the scenario manually',
  specErrorTitle: 'Specification generation failed',
  specErrorMessage: 'Could not generate the specification. Please try again.',
  closeError: 'Close error message',
  errorBoundaryTitle: 'Something went wrong',
  errorBoundaryDescription: 'This part of the app hit an error. The rest of the app is still running.',
  tryAgain: 'Try again',
  notFoundTitle: '404 Page Not Found',
  notFoundDescription: 'The page you requested could not be found.',
};

const russian: StudioCopy = {
  pageTitle: 'Text-to-BPMN Studio',
  pageDescription: 'Создавайте и редактируйте диаграммы процессов BPMN 2.0 по текстовому описанию.',
  brandCaption: 'Студия моделирования процессов',
  languageSwitcher: 'Язык интерфейса',
  switchToEnglish: 'Переключить интерфейс на английский',
  switchToRussian: 'Русский язык',
  descriptionStep: 'ШАГ 01 · ОПИСАНИЕ',
  describeProcess: 'Опишите бизнес-процесс',
  clearText: 'Очистить текст',
  clearTextTitle: 'Очистить описание, чат и сообщение об ошибке',
  nothingToClearTitle: 'Очищать пока нечего: все текстовые поля уже пусты',
  processingDocument: 'Обрабатываю документ…',
  importDocument: 'Импорт документа',
  importNote: 'DOCX, TXT · до 5 МБ',
  chooseDocument: 'Выбрать файл DOCX или TXT',
  descriptionPlaceholder: 'Например: Клиент отправляет заявку, менеджер проверяет её и, если всё корректно, передаёт в отдел исполнения…',
  descriptionAria: 'Описание процесса',
  designingAria: 'ИИ проектирует процесс',
  loginToGenerateAria: 'Войдите через Google, чтобы сгенерировать диаграмму',
  importingDocument: 'Импортирую документ…',
  designingProcess: 'ИИ проектирует процесс…',
  generateDiagram: 'Сгенерировать диаграмму',
  loginWithGoogle: 'Войти через Google',
  modelBuildingProgress: 'Модель строит диаграмму. Пожалуйста, не закрывайте страницу.',
  documentBuildingProgress: 'Извлекаю текст и строю диаграмму…',
  generationError: 'Не удалось построить диаграмму. Возможно, модель перегружена. Попробуйте позже.',
  refinementErrorFallback: 'Не удалось обновить диаграмму. Исходная схема сохранена — попробуйте уточнить ответ ещё раз.',
  documentErrorFallback: 'Не удалось импортировать документ. Проверьте формат файла и попробуйте ещё раз.',
  validatorTitle: 'Чат-валидатор',
  finishScenario: 'Завершить сценарий',
  finishScenarioTitle: 'Сценарий может быть завершён с ошибками',
  chatEmptyFirstLine: 'Здесь появятся замечания и вопросы',
  chatEmptySecondLine: 'по сгенерированной схеме',
  refiningDiagram: 'Обновляю диаграмму по вашему уточнению…',
  replyPlaceholder: 'Ваш ответ…',
  replyAria: 'Ответ валидатору',
  questions: [
    'Я построил базовый процесс. Что должно произойти, если на этапе «{{task}}» возникнет ошибка или отказ: завершить процесс или отправить уведомление клиенту?',
    'Схема готова. Требуется ли на шаге «{{task}}» дополнительная проверка данных перед переходом к следующему этапу?',
    'Логика процесса понятна. Нужно ли автоматически уведомлять ответственных лиц после выполнения шага «{{task}}»?',
  ],
  fallbackTaskName: 'этого этапа',
  finishedByUser: 'Процесс завершен пользователем',
  footerWorkflow: 'ЛОГИКА · СХЕМА · ЭКСПОРТ',
  resizeTitle: 'Зажмите, чтобы изменить размер',
  resizeAria: 'Изменить ширину панели',
  canvasTitle: 'Холст диаграммы',
  canvasReady: 'Готов к построению процесса',
  canvasSummary: (nodes, flows) => `${nodes} элементов · ${flows} потоков`,
  databaseButton: 'Схема БД',
  validatorTooltip: 'Ответьте на вопрос ИИ-валидатора, чтобы подтвердить логику процесса или завершите сценарий вручную',
  unlimitedAccess: 'Безлимитный доступ',
  unlimited: 'Безлимит',
  freeQuota: (count) => `Бесплатно: ${count}`,
  logout: 'Выйти',
  authPrompt: 'Войдите для генерации',
  authChecking: 'Проверка входа…',
  clearCanvas: 'Очистить холст',
  validated: 'ЛОГИКА ПОДТВЕРЖДЕНА',
  waitingForValidator: 'ОЖИДАЕТ ПРОВЕРКИ ВАЛИДАТОРОМ',
  bpmnDrawing: 'ЧЕРТЁЖ BPMN 2.0',
  sqlTitle: 'Схема базы данных',
  sqlDescription: 'DDL сгенерирован по текущей BPMN-диаграмме',
  copied: 'Скопировано',
  copySql: 'Копировать SQL',
  close: 'Закрыть',
  tasks: 'Задачи',
  gateways: 'Шлюзы',
  closeTaskChooser: 'Закрыть выбор типа задачи',
  closeGatewayChooser: 'Закрыть выбор типа шлюза',
  rollback: 'Вернуться назад',
  task: 'Задача',
  taskDescription: 'Обычная задача процесса',
  userTask: 'Пользовательская задача',
  userTaskDescription: 'Работа, которую выполняет человек',
  serviceTask: 'Сервисная задача',
  serviceTaskDescription: 'Автоматическая работа сервиса или системы',
  exclusiveGateway: 'Исключающий шлюз',
  exclusiveGatewayDescription: 'Направляет поток по одному пути в зависимости от данных',
  parallelGateway: 'Параллельный шлюз',
  parallelGatewayDescription: 'Разделяет поток на параллельные пути или объединяет их',
  eventBasedGateway: 'Шлюз на основе событий',
  eventBasedGatewayDescription: 'Выбирает путь по событию, которое наступит первым',
  renderError: 'Не удалось отобразить диаграмму. Проверьте структуру схемы.',
  exportXmlError: 'Не удалось выгрузить BPMN. Проверьте, что диаграмма построена.',
  exportSvgError: 'Не удалось выгрузить SVG. Проверьте, что диаграмма построена.',
  exportBpmn: 'Скачать BPMN (XML)',
  exportSvg: 'Скачать SVG',
  specGenerating: 'Аналитик пишет ТЗ…',
  specGenerate: 'Сгенерировать ТЗ',
  specDownloadMarkdown: 'Скачать в формате Markdown (.md)',
  specDownloadWord: 'Скачать в формате Word (.docx)',
  specTooltip: 'Ответьте на вопрос ИИ-валидатора, чтобы подтвердить логику процесса или завершите сценарий вручную',
  specErrorTitle: 'Ошибка генерации ТЗ',
  specErrorMessage: 'Не удалось сгенерировать ТЗ. Попробуйте ещё раз.',
  closeError: 'Закрыть сообщение об ошибке',
  errorBoundaryTitle: 'Что-то пошло не так',
  errorBoundaryDescription: 'В этой части приложения произошла ошибка. Остальные функции продолжают работать.',
  tryAgain: 'Попробовать снова',
  notFoundTitle: 'Страница не найдена (404)',
  notFoundDescription: 'Не удалось найти запрошенную страницу.',
};

export function getUiText(language: Language): StudioCopy {
  return language === 'ru' ? russian : english;
}

export function getInitialLanguage(): Language {
  try {
    return typeof window !== 'undefined' &&
      window.localStorage.getItem('text-to-bpmn-language') === 'ru'
      ? 'ru'
      : 'en';
  } catch {
    return 'en';
  }
}

const bpmnRussianTranslations: Record<string, string> = {
  'Activate hand tool': 'Включить перемещение холста',
  'Activate lasso tool': 'Включить выделение рамкой',
  'Activate create/remove space tool': 'Включить добавление или удаление пространства',
  'Activate global connect tool': 'Включить инструмент соединения',
  'Create start event': 'Создать начальное событие',
  'Create intermediate/boundary event': 'Создать промежуточное или граничное событие',
  'Create end event': 'Создать конечное событие',
  'Create gateway': 'Создать шлюз',
  'Create task': 'Создать задачу',
  'Create data object reference': 'Создать ссылку на объект данных',
  'Create data store reference': 'Создать ссылку на хранилище данных',
  'Create expanded sub-process': 'Создать развернутый подпроцесс',
  'Create pool/participant': 'Создать пул или участника',
  'Create group': 'Создать группу',
  'Add lane above': 'Добавить дорожку выше',
  'Add lane below': 'Добавить дорожку ниже',
  'Add text annotation': 'Добавить текстовую аннотацию',
  'Align elements': 'Выровнять элементы',
  'Align elements ': 'Выровнять элементы ',
  'Append compensation activity': 'Добавить компенсирующую задачу',
  'Append conditional intermediate catch event': 'Добавить промежуточное условное событие',
  'Append end event': 'Добавить конечное событие',
  'Append gateway': 'Добавить шлюз',
  'Append intermediate/boundary event': 'Добавить промежуточное или граничное событие',
  'Append message intermediate catch event': 'Добавить промежуточное событие получения сообщения',
  'Append receive task': 'Добавить задачу получения сообщения',
  'Append signal intermediate catch event': 'Добавить промежуточное событие получения сигнала',
  'Append task': 'Добавить задачу',
  'Append timer intermediate catch event': 'Добавить промежуточное событие таймера',
  'Change element': 'Изменить элемент',
  'Collection': 'Коллекция',
  'Connect to other element': 'Соединить с другим элементом',
  'Connect using association': 'Соединить ассоциацией',
  'Connect using data input association': 'Соединить ассоциацией входных данных',
  'Delete': 'Удалить',
  'Distribute elements horizontally': 'Распределить элементы по горизонтали',
  'Distribute elements vertically': 'Распределить элементы по вертикали',
  'Divide into three lanes': 'Разделить на три дорожки',
  'Divide into two lanes': 'Разделить на две дорожки',
  'Loop': 'Цикл',
  'Open {element}': 'Открыть {element}',
  'Parallel multi-instance': 'Параллельный многократный запуск',
  'Participant multiplicity': 'Кратность участника',
  'Search in diagram': 'Искать на диаграмме',
  'Sequential multi-instance': 'Последовательный многократный запуск',
  'Toggle non-interrupting': 'Переключить режим без прерывания',
};
const bpmnEnglishTranslations=Object.fromEntries(
  Object.entries(bpmnRussianTranslations).map(([englishText,russianText])=>[russianText,englishText]),
);

export function translateBpmnUi(
  template: string,
  language: Language,
  replacements: Record<string, string> = {},
): string {
  const englishTemplate=bpmnEnglishTranslations[template]??template;
  const localized = language === 'ru'
    ? bpmnRussianTranslations[englishTemplate] ?? template
    : englishTemplate;
  return localized.replace(/{([^}]+)}/g, (_, key: string) => replacements[key] ?? `{${key}}`);
}

const errorPairs: Array<[string, string]> = [
  ['Не удалось построить диаграмму: модель перегружена. Попробуйте повторить запрос позже.', 'Could not build the diagram because the model is busy. Please try again later.'],
  ['Не удалось обновить диаграмму. Исходная схема сохранена — попробуйте уточнить ответ ещё раз.', 'Could not update the diagram. The original diagram is preserved. Please clarify your response and try again.'],
  ['Не удалось импортировать документ. Проверьте формат файла и попробуйте ещё раз.', 'Could not import the document. Check the file format and try again.'],
  ['Не удалось отобразить диаграмму. Проверьте структуру схемы.', 'Could not display the diagram. Check the diagram structure.'],
  ['Не удалось выгрузить BPMN. Проверьте, что диаграмма построена.', 'Could not export BPMN. Make sure a diagram has been created.'],
  ['Не удалось выгрузить SVG. Проверьте, что диаграмма построена.', 'Could not export SVG. Make sure a diagram has been created.'],
  ['Для генерации войдите через Google.', 'Sign in with Google to generate a diagram.'],
  ['Сессия пользователя больше не действительна. Войдите через Google.', 'Your session is no longer valid. Sign in with Google again.'],
  ['Бесплатные генерации закончились. Войдите в аккаунт с подпиской или обратитесь к администратору.', 'Your free generations are used up. Sign in with a subscription or contact the administrator.'],
  ['Генерации временно ограничены правилами использования подписки. Попробуйте позже.', 'Generations are temporarily limited under the subscription fair-use policy. Please try again later.'],
  ['Не удалось дождаться ответа Gemini после повторных попыток. Описание сохранено — попробуйте ещё раз немного позже.', 'Gemini did not respond after several attempts. Your description is saved; please try again shortly.'],
  ['Ответ Gemini превысил лимит длины и был обрезан. Разделите процесс на части. Исходное описание сохранено.', 'Gemini’s response exceeded the length limit and was truncated. Split the process into smaller parts. Your description is saved.'],
  ['Файл слишком большой. Максимальный размер — 5 МБ.', 'The file is too large. The maximum size is 5 MB.'],
  ['Не удалось принять файл. Загрузите документ .docx или .txt.', 'Could not receive the file. Upload a .docx or .txt document.'],
  ['Выберите файл .docx или .txt для импорта.', 'Choose a .docx or .txt file to import.'],
  ['Не удалось обработать документ.', 'Could not process the document.'],
  ['Уточнение не сохранило исходные элементы схемы. Повторите ответ или уточните, какую ветвь изменить.', 'The clarification did not preserve the existing diagram elements. Try again or specify which branch to change.'],
  ['Уточнение создало некорректные связи. Исходная диаграмма сохранена.', 'The clarification created invalid connections. The original diagram is preserved.'],
  ['Уточнение нарушило существующую ветвь процесса. Диаграмма сохранена без изменений.', 'The clarification would break an existing process branch. The diagram is unchanged.'],
  ['Модель не внесла изменение в диаграмму. Попробуйте описать, на каком шаге должна появиться новая ветвь или действие.', 'The model did not change the diagram. Specify where the new branch or action should appear.'],
  ['OPENROUTER_API_KEY не настроен в Secrets проекта.', 'OPENROUTER_API_KEY is not configured in the project Secrets.'],
  ['OpenRouter не смог построить диаграмму. Проверьте настройки модели и API-ключ.', 'OpenRouter could not build the diagram. Check the model settings and API key.'],
  ['В BPMN найдены русские подписи, хотя исходное описание написано на английском.', 'Russian BPMN labels were found even though the source description is English.'],
  ['В BPMN найдены английские подписи, хотя исходное описание написано на русском.', 'English BPMN labels were found even though the source description is Russian.'],
  ['Язык подписей BPMN не соответствует языку исходного описания.', 'The BPMN label language does not match the source description.'],
  ['OpenRouter продолжает ограничивать запросы после повторных попыток. Проверьте квоту модели и повторите запрос позже.', 'OpenRouter is still rate-limiting requests after retries. Check the model quota and try again later.'],
  ['OpenRouter не ответил после повторных попыток. Проверьте доступность модели и повторите запрос позже.', 'OpenRouter did not respond after several attempts. Check model availability and try again later.'],
  ['OpenRouter не ответил на автоматическую попытку исправления. Повторите запрос позже.', 'OpenRouter did not respond to the automatic correction attempt. Please try again later.'],
  ['OpenRouter продолжает ограничивать запросы после повторных попыток. Проверьте квоту модели и повторите запрос позже.', 'OpenRouter is still rate-limiting requests after retries. Check the model quota and try again later.'],
  ['OpenRouter не смог построить диаграмму. Проверьте настройки модели и API-ключ.', 'OpenRouter could not build the diagram. Check the model settings and API key.'],
  ['Ответ OpenRouter не удалось разобрать как JSON.', 'Could not parse the OpenRouter response as JSON.'],
  ['Не удалось завершить сессию.', 'Could not end the session.'],
  ['A non-empty description is required.', 'Введите описание процесса.'],
  ['A description, clarification, and BPMN graph are required.', 'Нужны описание процесса, уточнение и BPMN-граф.'],
  ['A valid BPMN graph is required.', 'Нужен корректный BPMN-граф.'],
  ['Gemini returned an invalid response.', 'Gemini вернул некорректный ответ.'],
  ['Gemini вернул некорректный ответ.', 'Gemini returned an invalid response.'],
  ['Достигнут лимит запросов Gemini. Описание сохранено — повторите запрос позже или проверьте квоту Google.', 'Gemini request limit reached. Your description is saved; try again later or check your Google quota.'],
  ['Gemini временно недоступен. Автоматические повторные попытки не помогли. Описание сохранено — попробуйте немного позже.', 'Gemini is temporarily unavailable. Automatic retries did not help. Your description is saved; try again shortly.'],
  ['Gemini отклонил доступ. Администратору нужно проверить ключ API и разрешения Google.', 'Gemini denied access. An administrator should check the API key and Google permissions.'],
  ['Gemini отклонил запрос. Возможно, описание превышает ограничения модели; попробуйте разделить процесс на части.', 'Gemini rejected the request. The description may exceed model limits; try splitting the process into smaller parts.'],
  ['Gemini отклонил запрос. Администратору нужно проверить настройки модели.', 'Gemini rejected the request. An administrator should check the model settings.'],
  ['Gemini returned an empty response.', 'Gemini вернул пустой ответ.'],
  ['Gemini did not return a valid BPMN graph.', 'Gemini не вернул корректный BPMN-граф.'],
  ['Gemini returned a graph in an invalid format.', 'Gemini вернул граф в неверном формате.'],
  ['Gemini did not return a valid BPMN graph update.', 'Gemini не вернул корректное обновление BPMN-графа.'],
  ['Gemini returned a graph update in an invalid format.', 'Gemini вернул обновление графа в неверном формате.'],
  ['Gemini returned an empty specification.', 'Gemini вернул пустое техническое задание.'],
  ['Gemini returned a specification in an invalid format.', 'Gemini вернул техническое задание в неверном формате.'],
  ['AI_API_KEY is not configured in the app\'s Secrets.', 'AI_API_KEY не настроен в Secrets проекта.'],
  ['The uploaded file is not a valid DOCX archive.', 'Загруженный файл не является корректным DOCX-документом.'],
  ['Only .docx and .txt files are supported.', 'Поддерживаются только файлы .docx и .txt.'],
  ['The document does not contain readable text.', 'В документе не найден читаемый текст.'],
  ['No JSON object in model response.', 'В ответе модели не найден JSON-объект.'],
  ['Model response must be a JSON object.', 'Ответ модели должен быть JSON-объектом.'],
  ['Missing nodes or edges.', 'В графе отсутствуют узлы или связи.'],
  ['A non-empty description is required.', 'Введите описание процесса.'],
  ['The description must contain between 1 and 60000 characters.', 'Описание должно содержать от 1 до 60 000 символов.'],
  ['Retry limit exceeded', 'Превышено число повторных попыток.'],
  ['Отсутствует тег definitions', 'The definitions tag is missing.'],
  ['Не найден блок BPMNDiagram', 'The BPMNDiagram block was not found.'],
  ['Ошибка парсинга синтаксиса', 'XML syntax parsing failed.'],
  ['Граф процесса пуст или имеет неверный формат.', 'The process graph is empty or has an invalid format.'],
  ['Идентификаторы узлов должны быть уникальны.', 'Node identifiers must be unique.'],
  ['Связь ссылается на отсутствующий узел.', 'A connection refers to a missing node.'],
  ['XML диаграммы повреждён.', 'The diagram XML is malformed.'],
  ['В XML не найден процесс BPMN.', 'No BPMN process was found in the XML.'],
  ['В XML не найдены элементы процесса или диаграммы BPMN.', 'The XML is missing the BPMN process or diagram elements.'],
  ['Не удалось подготовить XML для уточнения диаграммы.', 'Could not prepare the XML for diagram refinement.'],
  ['Связь уточнения ссылается на неизвестный узел.', 'A refinement connection refers to an unknown node.'],
  ['Не удалось восстановить входящие и исходящие связи.', 'Could not restore incoming and outgoing connections.'],
  ['Не удалось определить нижнюю границу существующей схемы.', 'Could not determine the bottom edge of the existing diagram.'],
  ['Не удалось определить расположение нового процесса.', 'Could not determine the position for the new process.'],
  ['Ответ не содержит JSON-граф.', 'The response does not contain a JSON graph.'],
  ['Не удалось создать SQL-схему: BPMN XML некорректен.', 'Could not build the SQL schema because the BPMN XML is invalid.'],
  ['Граф не содержит nodes и edges.', 'The graph is missing nodes or edges.'],
  ['Неверный узел.', 'Invalid node.'],
  ['Неверный id или тип узла.', 'Invalid node ID or type.'],
  ['Пустой граф или повторяющиеся id.', 'The graph is empty or contains duplicate IDs.'],
  ['Неверная связь.', 'Invalid connection.'],
];

export function localizeKnownError(message: string, language: Language): string {
  const match = errorPairs.find(([russianText, englishText]) =>
    message === russianText || message === englishText,
  );
  if (match) {
    const firstIsRussian=/[А-Яа-яЁё]/.test(match[0]);
    const russianText=firstIsRussian?match[0]:match[1];
    const englishText=firstIsRussian?match[1]:match[0];
    return language === 'ru' ? russianText : englishText;
  }

  const promptLength = message.match(/^textPrompt must contain between 1 and ([\d,]+) characters\.$/);
  if (promptLength) {
    const max = promptLength[1];
    return language === 'ru'
      ? `Описание должно содержать от 1 до ${max} символов.`
      : `The description must contain between 1 and ${max} characters.`;
  }
  const httpGenerationError = message.match(/^Ошибка генерации: HTTP (\d{3})\.$/);
  if (httpGenerationError) {
    return language === 'ru'
      ? `Ошибка генерации: HTTP ${httpGenerationError[1]}.`
      : `Diagram generation failed: HTTP ${httpGenerationError[1]}.`;
  }
  const missingModelJson = message.match(/^Ответ OpenRouter не удалось разобрать как JSON: (.+)$/);
  if (missingModelJson) {
    return language === 'ru'
      ? `Ответ OpenRouter не удалось разобрать как JSON: ${missingModelJson[1]}`
      : `Could not parse the OpenRouter response as JSON: ${missingModelJson[1]}`;
  }
  const dynamicNodeError = message.match(/^Не удалось создать узел (.+)\.$/);
  if (dynamicNodeError) {
    return language === 'ru'
      ? message
      : `Could not create node ${dynamicNodeError[1]}.`;
  }
  const dynamicFlowError = message.match(/^Не удалось создать поток (.+)\.$/);
  if (dynamicFlowError) {
    return language === 'ru'
      ? message
      : `Could not create flow ${dynamicFlowError[1]}.`;
  }
  const dynamicPositionError = message.match(/^Не удалось определить расположение узла (.+)\.$/);
  if (dynamicPositionError) {
    return language === 'ru'
      ? message
      : `Could not determine the position of node ${dynamicPositionError[1]}.`;
  }

  const correctionPrefix = 'Модель не вернула корректный BPMN XML даже после автоматического исправления. Причина: ';
  if (message.startsWith(correctionPrefix) && language === 'en') {
    const reason=message.slice(correctionPrefix.length);
    return `The model returned invalid BPMN XML even after automatic correction. Reason: ${localizeKnownError(reason,'en')}`;
  }

  const invalidDiagramSql = '-- Не удалось разобрать BPMN-схему';
  if (message === invalidDiagramSql) {
    return language === 'ru' ? invalidDiagramSql : '-- Could not parse the BPMN diagram';
  }

  return message;
}
