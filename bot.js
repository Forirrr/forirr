const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ======================================================
// SUPABASE
// ======================================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ======================================================
// TELEGRAM
// ======================================================

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не найден!');
    process.exit(1);
}

const bot = new TelegramBot(token, {
    polling: true
});

console.log('🚀 SCHEDULE BOT ONLINE');

// ======================================================
// ДНИ
// ======================================================

const dayNames = {
    '1': 'Понедельник',
    '2': 'Вторник',
    '3': 'Среда',
    '4': 'Четверг',
    '5': 'Пятница',
    '6': 'Суббота',
    '7': 'Воскресенье',

    'Понедельник': 'Понедельник',
    'Вторник': 'Вторник',
    'Среда': 'Среда',
    'Четверг': 'Четверг',
    'Пятница': 'Пятница',
    'Суббота': 'Суббота',
    'Воскресенье': 'Воскресенье'
};

const weekDays = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота'
];

const dayOrder = {
    'Понедельник': 1,
    'Вторник': 2,
    'Среда': 3,
    'Четверг': 4,
    'Пятница': 5,
    'Суббота': 6,
    'Воскресенье': 7
};

// ======================================================
// ВРЕМЯ ПАР
// ======================================================

const normalLessonTimes = {
    1: '08:30–10:00',
    2: '10:10–11:40',
    3: '12:20–13:50',
    4: '14:00–15:30',
    5: '15:40–17:10'
};

const mondayLessonTimes = {
    1: '08:30–09:50',
    2: '10:40–12:00',
    3: '12:40–14:00',
    4: '14:10–15:30',
    5: '15:40–17:00'
};

// ======================================================
// ВРЕМЯ КОНКРЕТНОЙ ПАРЫ
// ======================================================

function getLessonTime(day, lessonNumber) {

    const number = Number(lessonNumber);

    if (day === 'Понедельник') {
        return mondayLessonTimes[number] || 'Время не указано';
    }

    return normalLessonTimes[number] || 'Время не указано';
}

// ======================================================
// ПРЕОБРАЗОВАНИЕ ВРЕМЕНИ
// ======================================================

function timeToMinutes(time) {

    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
}

function getTimeParts(timeRange) {

    const clean = timeRange.replace(/[–-]/g, '-');

    const parts = clean.split('-');

    return {
        start: parts[0],
        end: parts[1]
    };
}

// ======================================================
// ТЕКУЩЕЕ ВРЕМЯ КАЗАХСТАНА
// ======================================================

function getKazakhstanDateParts() {

    const formatter = new Intl.DateTimeFormat(
        'en-CA',
        {
            timeZone: 'Asia/Almaty',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            weekday: 'long'
        }
    );

    const parts = formatter.formatToParts(new Date());

    const result = {};

    parts.forEach(part => {
        result[part.type] = part.value;
    });

    return result;
}

// ======================================================
// ТЕКУЩИЙ ДЕНЬ
// ======================================================

function getToday() {

    const parts = getKazakhstanDateParts();

    const map = {
        Monday: 'Понедельник',
        Tuesday: 'Вторник',
        Wednesday: 'Среда',
        Thursday: 'Четверг',
        Friday: 'Пятница',
        Saturday: 'Суббота',
        Sunday: 'Воскресенье'
    };

    return map[parts.weekday];
}

// ======================================================
// ТЕКУЩЕЕ ВРЕМЯ В МИНУТАХ
// ======================================================

function getCurrentMinutes() {

    const parts = getKazakhstanDateParts();

    return (
        Number(parts.hour) * 60 +
        Number(parts.minute)
    );
}

// ======================================================
// ФОРМАТ ВРЕМЕНИ
// ======================================================

function getCurrentTime() {

    const parts = getKazakhstanDateParts();

    return `${parts.hour}:${parts.minute}`;
}

// ======================================================
// СЛЕДУЮЩИЙ УЧЕБНЫЙ ДЕНЬ
// ======================================================

function getTomorrowDay() {

    const today = getToday();

    const index = weekDays.indexOf(today);

    if (index === -1) {
        return 'Понедельник';
    }

    if (index === weekDays.length - 1) {
        return 'Понедельник';
    }

    return weekDays[index + 1];
}

// ======================================================
// ПОЛУЧИТЬ РАСПИСАНИЕ
// ======================================================

async function getSchedule(groupId) {

    const { data, error } = await supabase
        .from('schedule')
        .select('*')
        .eq('group_id', groupId);

    if (error) {
        throw error;
    }

    return data || [];
}

// ======================================================
// ПОЛУЧИТЬ ГРУППУ
// ======================================================

async function getGroup(groupId) {

    const { data, error } = await supabase
        .from('groups')
        .select('id, name')
        .eq('id', groupId)
        .single();

    if (error || !data) {
        return null;
    }

    return data;
}

// ======================================================
// ФИЛЬТР ДНЯ
// ======================================================

function getDaySchedule(schedule, selectedDay) {

    const result = schedule.filter(row => {

        const rowDay =
            dayNames[String(row.day_of_week)] ||
            String(row.day_of_week);

        return rowDay === selectedDay;
    });

    result.sort((a, b) =>
        Number(a.lesson_number) -
        Number(b.lesson_number)
    );

    return result;
}

// ======================================================
// ПОЛУЧИТЬ СОСТОЯНИЕ ДНЯ
// ======================================================

function getDayStatus(day, schedule) {

    if (!schedule || schedule.length === 0) {

        return {
            type: 'empty'
        };
    }

    const currentMinutes = getCurrentMinutes();

    let currentLesson = null;
    let nextLesson = null;

    for (const lesson of schedule) {

        const lessonNumber =
            Number(lesson.lesson_number);

        const time =
            getLessonTime(day, lessonNumber);

        const {
            start,
            end
        } = getTimeParts(time);

        const startMinutes =
            timeToMinutes(start);

        const endMinutes =
            timeToMinutes(end);

        if (
            currentMinutes >= startMinutes &&
            currentMinutes < endMinutes
        ) {

            currentLesson = lesson;

            break;
        }

        if (
            currentMinutes < startMinutes &&
            !nextLesson
        ) {

            nextLesson = lesson;
        }
    }

    if (currentLesson) {

        const number =
            Number(currentLesson.lesson_number);

        const time =
            getLessonTime(day, number);

        const {
            start,
            end
        } = getTimeParts(time);

        const endMinutes =
            timeToMinutes(end);

        const remaining =
            endMinutes - currentMinutes;

        return {
            type: 'lesson',
            currentLesson,
            nextLesson,
            remaining
        };
    }

    if (nextLesson) {

        const number =
            Number(nextLesson.lesson_number);

        const time =
            getLessonTime(day, number);

        const {
            start
        } = getTimeParts(time);

        const startMinutes =
            timeToMinutes(start);

        const remaining =
            startMinutes - currentMinutes;

        return {
            type: 'break',
            currentLesson: null,
            nextLesson,
            remaining
        };
    }

    return {
        type: 'finished'
    };
}

// ======================================================
// ФОРМАТ МИНУТ
// ======================================================

function formatMinutes(minutes) {

    if (minutes <= 0) {
        return 'сейчас';
    }

    const hours =
        Math.floor(minutes / 60);

    const mins =
        minutes % 60;

    if (hours > 0) {

        return `${hours} ч ${mins} мин`;
    }

    return `${mins} мин`;
}

// ======================================================
// ГЛАВНЫЙ ЗАГОЛОВОК
// ======================================================

function header(
    groupName,
    day
) {

    const time =
        getCurrentTime();

    return (
        `${groupName}\n\n` +
        `${day.toUpperCase()} · ${time}\n`
    );
}

// ======================================================
// ФОРМАТ ПАРЫ — КАРТОЧКА
// ======================================================

function formatLessonCard(
    lesson,
    day
) {

    const number =
        Number(lesson.lesson_number);

    const time =
        getLessonTime(day, number);

    let text = '';

    text += `\n${String(number).padStart(2, '0')}  `;

    if (lesson.subject) {
        text += `${lesson.subject}\n`;
    } else {
        text += `Без названия\n`;
    }

    text += `    ${time}\n`;

    if (lesson.teacher) {
        text += `    ${lesson.teacher}\n`;
    }

    if (lesson.classroom) {
        text += `    ROOM ${lesson.classroom}\n`;
    }

    return text;
}

// ======================================================
// КЛАВИАТУРА ГЛАВНОГО ЭКРАНА
// ======================================================

function mainKeyboard(groupId) {

    return {
        inline_keyboard: [

            [
                {
                    text: '◉  СЕЙЧАС',
                    callback_data:
                        `now_${groupId}`
                },
                {
                    text: '📅  СЕГОДНЯ',
                    callback_data:
                        `today_${groupId}`
                }
            ],

            [
                {
                    text: '→  ЗАВТРА',
                    callback_data:
                        `tomorrow_${groupId}`
                },
                {
                    text: '▦  НЕДЕЛЯ',
                    callback_data:
                        `week_${groupId}`
                }
            ],

            [
                {
                    text: '🔔  УВЕДОМЛЕНИЯ',
                    callback_data:
                        `notifications_${groupId}`
                }
            ],

            [
                {
                    text: '⌂  ГЛАВНОЕ МЕНЮ',
                    callback_data:
                        'home'
                }
            ]
        ]
    };
}

// ======================================================
// КНОПКИ НАЗАД
// ======================================================

function backKeyboard(groupId) {

    return {
        inline_keyboard: [

            [
                {
                    text: '◉  СЕЙЧАС',
                    callback_data:
                        `now_${groupId}`
                }
            ],

            [
                {
                    text: '📅  СЕГОДНЯ',
                    callback_data:
                        `today_${groupId}`
                },
                {
                    text: '→  ЗАВТРА',
                    callback_data:
                        `tomorrow_${groupId}`
                }
            ],

            [
                {
                    text: '▦  НЕДЕЛЯ',
                    callback_data:
                        `week_${groupId}`
                }
            ],

            [
                {
                    text: '←  НАЗАД',
                    callback_data:
                        `group_${groupId}`
                }
            ]
        ]
    };
}

// ======================================================
// ГЛАВНОЕ МЕНЮ ГРУПП
// ======================================================

async function showGroups(chatId) {

    try {

        const { data: groups, error } =
            await supabase
                .from('groups')
                .select('id, name')
                .order('name');

        if (error) {

            console.error(
                '❌ Ошибка групп:',
                error.message
            );

            await bot.sendMessage(
                chatId,
                'Не удалось загрузить группы.'
            );

            return;
        }

        if (!groups || groups.length === 0) {

            await bot.sendMessage(
                chatId,
                'В базе данных пока нет групп.'
            );

            return;
        }

        const keyboard =
            groups.map(group => [

                {
                    text: `▣  ${group.name}`,
                    callback_data:
                        `group_${group.id}`
                }

            ]);

        await bot.sendMessage(
            chatId,

            `ВЫБЕРИТЕ ГРУППУ\n\n` +
            `Доступные учебные группы:`,

            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );

    } catch (error) {

        console.error(error);

        await bot.sendMessage(
            chatId,
            'Произошла ошибка.'
        );
    }
}

// ======================================================
// ГЛАВНЫЙ ЭКРАН ГРУППЫ
// ======================================================

async function showGroupMenu(
    chatId,
    groupId
) {

    try {

        const group =
            await getGroup(groupId);

        if (!group) {

            await bot.sendMessage(
                chatId,
                'Группа не найдена.'
            );

            return;
        }

        const schedule =
            await getSchedule(groupId);

        const uniqueDays = [
            ...new Set(
                schedule.map(row =>
                    dayNames[
                        String(row.day_of_week)
                    ] ||
                    String(row.day_of_week)
                )
            )
        ];

        uniqueDays.sort((a, b) =>
            (dayOrder[a] || 99) -
            (dayOrder[b] || 99)
        );

        const today =
            getToday();

        const todaySchedule =
            getDaySchedule(
                schedule,
                today
            );

        let statusText = '';

        if (today === 'Воскресенье') {

            statusText =
                `\n◌  ВОСКРЕСЕНЬЕ\n` +
                `   Сегодня учебных пар нет.\n`;

        } else {

            const status =
                getDayStatus(
                    today,
                    todaySchedule
                );

            if (status.type === 'lesson') {

                statusText =
                    `\n◉  СЕЙЧАС\n` +
                    `   Идёт пара №${status.currentLesson.lesson_number}\n`;

            } else if (status.type === 'break') {

                statusText =
                    `\n◌  ПЕРЕМЕНА\n` +
                    `   Следующая пара №${status.nextLesson.lesson_number}\n`;

            } else if (status.type === 'finished') {

                statusText =
                    `\n✓  УЧЕБНЫЙ ДЕНЬ ЗАВЕРШЁН\n`;

            } else {

                statusText =
                    `\n○  СЕГОДНЯ ПАР НЕТ\n`;
            }
        }

        let message =
            `${group.name}\n\n` +
            `${today.toUpperCase()} · ${getCurrentTime()}\n` +
            statusText +
            `\nВыберите раздел ниже.`;

        const keyboard = [
            [
                {
                    text: '◉  СЕЙЧАС',
                    callback_data:
                        `now_${groupId}`
                }
            ],

            [
                {
                    text: '📅  СЕГОДНЯ',
                    callback_data:
                        `today_${groupId}`
                },
                {
                    text: '→  ЗАВТРА',
                    callback_data:
                        `tomorrow_${groupId}`
                }
            ],

            [
                {
                    text: '▦  НЕДЕЛЯ',
                    callback_data:
                        `week_${groupId}`
                }
            ],

            [
                {
                    text: '🔔  УВЕДОМЛЕНИЯ',
                    callback_data:
                        `notifications_${groupId}`
                }
            ]
        ];

        uniqueDays.forEach(day => {

            keyboard.push([
                {
                    text: `${day}`,
                    callback_data:
                        `day_${groupId}_${day}`
                }
            ]);

        });

        keyboard.push([
            {
                text: '⌂  ГЛАВНОЕ МЕНЮ',
                callback_data:
                    'home'
            }
        ]);

        await bot.sendMessage(
            chatId,
            message,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ Ошибка меню:',
            error
        );

        await bot.sendMessage(
            chatId,
            'Ошибка при загрузке группы.'
        );
    }
}

// ======================================================
// СЕГОДНЯ
// ======================================================

async function showToday(
    chatId,
    groupId
) {

    const today =
        getToday();

    if (today === 'Воскресенье') {

        await bot.sendMessage(
            chatId,

            `ВОСКРЕСЕНЬЕ\n\n` +
            `◌  Сегодня учебных пар нет.\n\n` +
            `Можно посмотреть расписание\n` +
            `на следующую неделю.`,

            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '▦  НЕДЕЛЯ',
                                callback_data:
                                    `week_${groupId}`
                            }
                        ],
                        [
                            {
                                text: '←  НАЗАД',
                                callback_data:
                                    `group_${groupId}`
                            }
                        ]
                    ]
                }
            }
        );

        return;
    }

    await showDaySchedule(
        chatId,
        groupId,
        today
    );
}

// ======================================================
// ЗАВТРА
// ======================================================

async function showTomorrow(
    chatId,
    groupId
) {

    const tomorrow =
        getTomorrowDay();

    await showDaySchedule(
        chatId,
        groupId,
        tomorrow,
        'tomorrow'
    );
}

// ======================================================
// РАСПИСАНИЕ НА ДЕНЬ
// ======================================================

async function showDaySchedule(
    chatId,
    groupId,
    selectedDay,
    mode = 'normal'
) {

    try {

        const group =
            await getGroup(groupId);

        if (!group) {

            await bot.sendMessage(
                chatId,
                'Группа не найдена.'
            );

            return;
        }

        const allSchedule =
            await getSchedule(groupId);

        const schedule =
            getDaySchedule(
                allSchedule,
                selectedDay
            );

        let title =
            selectedDay.toUpperCase();

        if (mode === 'tomorrow') {
            title =
                `ЗАВТРА · ${selectedDay.toUpperCase()}`;
        }

        if (schedule.length === 0) {

            await bot.sendMessage(
                chatId,

                `${group.name}\n\n` +
                `${title}\n\n` +
                `○  В этот день пар нет.`,

                {
                    reply_markup:
                        backKeyboard(groupId)
                }
            );

            return;
        }

        let message =
            `${group.name}\n\n` +
            `${title}\n`;

        schedule.forEach((lesson, index) => {

            message +=
                `${formatLessonCard(
                    lesson,
                    selectedDay
                )}`;

            if (index !== schedule.length - 1) {
                message += '\n';
            }
        });

        await bot.sendMessage(
            chatId,
            message,
            {
                reply_markup:
                    backKeyboard(groupId)
            }
        );

    } catch (error) {

        console.error(
            '❌ Ошибка дня:',
            error
        );

        await bot.sendMessage(
            chatId,
            'Ошибка при загрузке расписания.'
        );
    }
}

// ======================================================
// СЕЙЧАС
// ======================================================

async function showNow(
    chatId,
    groupId
) {

    try {

        const group =
            await getGroup(groupId);

        if (!group) {

            await bot.sendMessage(
                chatId,
                'Группа не найдена.'
            );

            return;
        }

        const today =
            getToday();

        if (today === 'Воскресенье') {

            await bot.sendMessage(
                chatId,

                `${group.name}\n\n` +
                `◌  ВОСКРЕСЕНЬЕ\n\n` +
                `Сегодня учебных пар нет.`,

                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '▦  НЕДЕЛЯ',
                                    callback_data:
                                        `week_${groupId}`
                                }
                            ],
                            [
                                {
                                    text: '←  НАЗАД',
                                    callback_data:
                                        `group_${groupId}`
                                }
                            ]
                        ]
                    }
                }
            );

            return;
        }

        const allSchedule =
            await getSchedule(groupId);

        const todaySchedule =
            getDaySchedule(
                allSchedule,
                today
            );

        const status =
            getDayStatus(
                today,
                todaySchedule
            );

        // ==============================================
        // ПАРА
        // ==============================================

        if (status.type === 'lesson') {

            const lesson =
                status.currentLesson;

            const number =
                Number(lesson.lesson_number);

            const time =
                getLessonTime(
                    today,
                    number
                );

            const {
                end
            } = getTimeParts(time);

            let message =
                `${group.name}\n\n` +
                `◉  СЕЙЧАС\n\n` +
                `ПАРА №${String(number).padStart(2, '0')}\n\n`;

            if (lesson.subject) {
                message +=
                    `${lesson.subject}\n`;
            }

            message +=
                `\n${time}\n`;

            if (lesson.teacher) {

                message +=
                    `${lesson.teacher}\n`;
            }

            if (lesson.classroom) {

                message +=
                    `ROOM ${lesson.classroom}\n`;
            }

            message +=
                `\nОСТАЛОСЬ · ${formatMinutes(status.remaining)}\n` +
                `ДО ${end}`;

            await bot.sendMessage(
                chatId,
                message,
                {
                    reply_markup:
                        backKeyboard(groupId)
                }
            );

            return;
        }

        // ==============================================
        // ПЕРЕМЕНА
        // ==============================================

        if (status.type === 'break') {

            const lesson =
                status.nextLesson;

            const number =
                Number(lesson.lesson_number);

            const time =
                getLessonTime(
                    today,
                    number
                );

            const {
                start
            } = getTimeParts(time);

            let message =
                `${group.name}\n\n` +
                `◌  ПЕРЕМЕНА\n\n` +
                `Сейчас свободное время.\n\n` +
                `СЛЕДУЮЩАЯ ПАРА\n\n` +
                `${String(number).padStart(2, '0')}  `;

            if (lesson.subject) {
                message +=
                    `${lesson.subject}\n`;
            } else {
                message +=
                    `Без названия\n`;
            }

            message +=
                `    ${time}\n`;

            if (lesson.teacher) {

                message +=
                    `    ${lesson.teacher}\n`;
            }

            if (lesson.classroom) {

                message +=
                    `    ROOM ${lesson.classroom}\n`;
            }

            message +=
                `\nСТАРТ ЧЕРЕЗ · ${formatMinutes(status.remaining)}\n` +
                `ДО ${start}`;

            await bot.sendMessage(
                chatId,
                message,
                {
                    reply_markup:
                        backKeyboard(groupId)
                }
            );

            return;
        }

        // ==============================================
        // КОНЕЦ ДНЯ
        // ==============================================

        if (status.type === 'finished') {

            await bot.sendMessage(
                chatId,

                `${group.name}\n\n` +
                `✓  УЧЕБНЫЙ ДЕНЬ ЗАВЕРШЁН\n\n` +
                `Сегодня пар больше нет.\n\n` +
                `Хорошего отдыха.`,

                {
                    reply_markup:
                        backKeyboard(groupId)
                }
            );

            return;
        }

        // ==============================================
        // НЕТ ПАР
        // ==============================================

        await bot.sendMessage(
            chatId,

            `${group.name}\n\n` +
            `○  СЕГОДНЯ ПАР НЕТ\n\n` +
            `Для этой даты расписание отсутствует.`,

            {
                reply_markup:
                    backKeyboard(groupId)
            }
        );

    } catch (error) {

        console.error(
            '❌ Ошибка "Сейчас":',
            error
        );

        await bot.sendMessage(
            chatId,
            'Ошибка при определении текущей пары.'
        );
    }
}

// ======================================================
// НЕДЕЛЯ
// ======================================================

async function showWeek(
    chatId,
    groupId
) {

    try {

        const group =
            await getGroup(groupId);

        if (!group) {

            await bot.sendMessage(
                chatId,
                'Группа не найдена.'
            );

            return;
        }

        const schedule =
            await getSchedule(groupId);

        let message =
            `${group.name}\n\n` +
            `НЕДЕЛЯ\n`;

        let hasLessons = false;

        weekDays.forEach(day => {

            const daySchedule =
                getDaySchedule(
                    schedule,
                    day
                );

            if (daySchedule.length === 0) {
                return;
            }

            hasLessons = true;

            message +=
                `\n\n◆ ${day.toUpperCase()}\n`;

            daySchedule.forEach(lesson => {

                const number =
                    Number(lesson.lesson_number);

                const time =
                    getLessonTime(
                        day,
                        number
                    );

                message +=
                    `\n${String(number).padStart(2, '0')}  `;

                if (lesson.subject) {
                    message +=
                        `${lesson.subject}\n`;
                } else {
                    message +=
                        `Без названия\n`;
                }

                message +=
                    `    ${time}\n`;

                if (lesson.teacher) {

                    message +=
                        `    ${lesson.teacher}\n`;
                }

                if (lesson.classroom) {

                    message +=
                        `    ROOM ${lesson.classroom}\n`;
                }
            });
        });

        if (!hasLessons) {

            message +=
                `\n\n○  Расписание отсутствует.`;
        }

        await bot.sendMessage(
            chatId,
            message,
            {
                reply_markup:
                    backKeyboard(groupId)
            }
        );

    } catch (error) {

        console.error(
            '❌ Ошибка недели:',
            error
        );

        await bot.sendMessage(
            chatId,
            'Ошибка при загрузке расписания.'
        );
    }
}

// ======================================================
// УВЕДОМЛЕНИЯ — ПОКА ЗАГЛУШКА
// ======================================================

async function showNotifications(
    chatId,
    groupId
) {

    await bot.sendMessage(
        chatId,

        `УТРЕННИЕ УВЕДОМЛЕНИЯ\n\n` +
        `Эта функция будет подключена\n` +
        `на следующем этапе.\n\n` +
        `Бот сможет каждое утро отправлять:\n\n` +
        `• первую пару\n` +
        `• кабинет\n` +
        `• преподавателя\n` +
        `• время начала`,

        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '←  НАЗАД',
                            callback_data:
                                `group_${groupId}`
                        }
                    ]
                ]
            }
        }
    );
}

// ======================================================
// /START
// ======================================================

bot.onText(
    /^\/(start|groups)$/,

    async (msg) => {

        await showGroups(
            msg.chat.id
        );
    }
);

// ======================================================
// CALLBACK
// ======================================================

bot.on(
    'callback_query',

    async (query) => {

        const chatId =
            query.message.chat.id;

        const data =
            query.data;

        try {

            await bot.answerCallbackQuery(
                query.id
            );

        } catch (error) {

            console.error(
                error.message
            );
        }

        // ==============================================
        // HOME
        // ==============================================

        if (data === 'home') {

            await showGroups(
                chatId
            );

            return;
        }

        // ==============================================
        // GROUP
        // ==============================================

        if (data.startsWith('group_')) {

            const groupId =
                data.substring(6);

            await showGroupMenu(
                chatId,
                groupId
            );

            return;
        }

        // ==============================================
        // TODAY
        // ==============================================

        if (data.startsWith('today_')) {

            const groupId =
                data.substring(6);

            await showToday(
                chatId,
                groupId
            );

            return;
        }

        // ==============================================
        // NOW
        // ==============================================

        if (data.startsWith('now_')) {

            const groupId =
                data.substring(4);

            await showNow(
                chatId,
                groupId
            );

            return;
        }

        // ==============================================
        // TOMORROW
        // ==============================================

        if (data.startsWith('tomorrow_')) {

            const groupId =
                data.substring(9);

            await showTomorrow(
                chatId,
                groupId
            );

            return;
        }

        // ==============================================
        // WEEK
        // ==============================================

        if (data.startsWith('week_')) {

            const groupId =
                data.substring(5);

            await showWeek(
                chatId,
                groupId
            );

            return;
        }

        // ==============================================
        // NOTIFICATIONS
        // ==============================================

        if (data.startsWith('notifications_')) {

            const groupId =
                data.substring(15);

            await showNotifications(
                chatId,
                groupId
            );

            return;
        }

        // ==============================================
        // DAY
        // ==============================================

        if (data.startsWith('day_')) {

            const value =
                data.substring(4);

            const separatorIndex =
                value.indexOf('_');

            const groupId =
                value.substring(
                    0,
                    separatorIndex
                );

            const selectedDay =
                value.substring(
                    separatorIndex + 1
                );

            await showDaySchedule(
                chatId,
                groupId,
                selectedDay
            );

            return;
        }
    }
);

// ======================================================
// TELEGRAM ERRORS
// ======================================================

bot.on(
    'polling_error',
    (error) => {

        console.error(
            '❌ Telegram polling error:',
            error.message
        );
    }
);

// ======================================================
// GLOBAL ERRORS
// ======================================================

process.on(
    'unhandledRejection',
    (error) => {

        console.error(
            '❌ Unhandled rejection:',
            error
        );
    }
);

process.on(
    'uncaughtException',
    (error) => {

        console.error(
            '❌ Uncaught exception:',
            error
        );
    }
);
