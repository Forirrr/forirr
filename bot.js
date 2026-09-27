const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// SUPABASE
// ==========================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ==========================================
// TELEGRAM
// ==========================================

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не найден!');
    process.exit(1);
}

const bot = new TelegramBot(token, {
    polling: true
});

console.log('✅ Бот запущен!');

// ==========================================
// ДНИ
// ==========================================

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

// ==========================================
// ВРЕМЯ ПАР
// ==========================================

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

// ==========================================
// ВРЕМЯ КОНКРЕТНОЙ ПАРЫ
// ==========================================

function getLessonTime(day, lessonNumber) {

    const number = Number(lessonNumber);

    if (day === 'Понедельник') {
        return mondayLessonTimes[number] || 'Время не указано';
    }

    return normalLessonTimes[number] || 'Время не указано';
}

// ==========================================
// ТЕКУЩИЙ ДЕНЬ В КАЗАХСТАНЕ
// ==========================================

function getToday() {

    const today = new Intl.DateTimeFormat(
        'ru-RU',
        {
            timeZone: 'Asia/Almaty',
            weekday: 'long'
        }
    ).format(new Date());

    return today.charAt(0).toUpperCase() + today.slice(1);
}

// ==========================================
// ГЛАВНОЕ МЕНЮ ГРУПП
// ==========================================

async function showGroups(chatId) {

    try {

        const { data: groups, error } = await supabase
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
                '❌ Не удалось загрузить группы.'
            );

            return;
        }

        if (!groups || groups.length === 0) {

            await bot.sendMessage(
                chatId,
                '📚 В базе данных пока нет групп.'
            );

            return;
        }

        const keyboard = groups.map(group => [

            {
                text: `📚 ${group.name}`,
                callback_data: `group_${group.id}`
            }

        ]);

        await bot.sendMessage(
            chatId,
            '📚 *Выберите вашу группу:*',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );

    } catch (error) {

        console.error(error);

        await bot.sendMessage(
            chatId,
            '❌ Произошла ошибка.'
        );
    }
}

// ==========================================
// МЕНЮ ГРУППЫ
// ==========================================

async function showGroupMenu(chatId, groupId) {

    try {

        const { data: group, error: groupError } =
            await supabase
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();

        if (groupError || !group) {

            await bot.sendMessage(
                chatId,
                '❌ Группа не найдена.'
            );

            return;
        }

        const { data: schedule, error } =
            await supabase
                .from('schedule')
                .select('day_of_week')
                .eq('group_id', groupId);

        if (error) {

            console.error(error);

            await bot.sendMessage(
                chatId,
                '❌ Ошибка при загрузке расписания.'
            );

            return;
        }

        if (!schedule || schedule.length === 0) {

            await bot.sendMessage(
                chatId,
                `📚 *${group.name}*\n\n❌ Расписание пока отсутствует.`,
                {
                    parse_mode: 'Markdown'
                }
            );

            return;
        }

        const uniqueDays = [
            ...new Set(
                schedule.map(row =>
                    dayNames[String(row.day_of_week)]
                    || String(row.day_of_week)
                )
            )
        ];

        uniqueDays.sort((a, b) =>
            (dayOrder[a] || 99) -
            (dayOrder[b] || 99)
        );

        const keyboard = [];

        // Сегодня
        keyboard.push([
            {
                text: '📅 Сегодня',
                callback_data: `today_${groupId}`
            }
        ]);

        // Вся неделя
        keyboard.push([
            {
                text: '📆 Вся неделя',
                callback_data: `week_${groupId}`
            }
        ]);

        // Дни
        uniqueDays.forEach(day => {

            keyboard.push([
                {
                    text: `📅 ${day}`,
                    callback_data:
                        `day_${groupId}_${day}`
                }
            ]);

        });

        keyboard.push([
            {
                text: '🏠 Главное меню',
                callback_data: 'home'
            }
        ]);

        await bot.sendMessage(
            chatId,
            `📚 *Группа: ${group.name}*\n\n` +
            `📅 *Выберите нужный вариант:*`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );

    } catch (error) {

        console.error(error);

        await bot.sendMessage(
            chatId,
            '❌ Ошибка при загрузке группы.'
        );
    }
}

// ==========================================
// ФОРМАТИРОВАНИЕ ОДНОЙ ПАРЫ
// ==========================================

function formatLesson(lesson, day) {

    const lessonNumber =
        Number(lesson.lesson_number);

    const lessonTime =
        getLessonTime(
            day,
            lessonNumber
        );

    let text = '';

    text +=
        `🔢 *${lessonNumber} пара* — ${lessonTime}\n`;

    if (lesson.subject) {
        text += `📖 ${lesson.subject}\n`;
    }

    if (lesson.teacher) {
        text += `👨‍🏫 ${lesson.teacher}\n`;
    }

    if (lesson.classroom) {
        text += `🚪 Кабинет: ${lesson.classroom}\n`;
    }

    return text;
}

// ==========================================
// ПОЛУЧИТЬ РАСПИСАНИЕ
// ==========================================

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

// ==========================================
// РАСПИСАНИЕ НА ДЕНЬ
// ==========================================

async function showDaySchedule(
    chatId,
    groupId,
    selectedDay
) {

    try {

        const { data: group, error: groupError } =
            await supabase
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();

        if (groupError || !group) {

            await bot.sendMessage(
                chatId,
                '❌ Группа не найдена.'
            );

            return;
        }

        const allSchedule =
            await getSchedule(groupId);

        const schedule =
            allSchedule.filter(row => {

                const rowDay =
                    dayNames[
                        String(row.day_of_week)
                    ] ||
                    String(row.day_of_week);

                return rowDay === selectedDay;
            });

        schedule.sort((a, b) =>
            Number(a.lesson_number) -
            Number(b.lesson_number)
        );

        if (schedule.length === 0) {

            await bot.sendMessage(
                chatId,
                `📚 *${group.name}*\n` +
                `📅 *${selectedDay}*\n\n` +
                `❌ В этот день пар нет.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '⬅️ Назад',
                                    callback_data:
                                        `group_${groupId}`
                                }
                            ],
                            [
                                {
                                    text: '🏠 Главное меню',
                                    callback_data: 'home'
                                }
                            ]
                        ]
                    }
                }
            );

            return;
        }

        let message =
            `📚 *${group.name}*\n` +
            `📅 *${selectedDay}*\n\n`;

        schedule.forEach(lesson => {

            message +=
                '━━━━━━━━━━━━━━\n';

            message +=
                formatLesson(
                    lesson,
                    selectedDay
                );

            message += '\n';
        });

        message +=
            '━━━━━━━━━━━━━━';

        await bot.sendMessage(
            chatId,
            message,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '⬅️ Другой день',
                                callback_data:
                                    `group_${groupId}`
                            }
                        ],
                        [
                            {
                                text: '🏠 Главное меню',
                                callback_data: 'home'
                            }
                        ]
                    ]
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ Ошибка расписания:',
            error
        );

        await bot.sendMessage(
            chatId,
            '❌ Ошибка при загрузке расписания.'
        );
    }
}

// ==========================================
// РАСПИСАНИЕ НА СЕГОДНЯ
// ==========================================

async function showToday(
    chatId,
    groupId
) {

    const today = getToday();

    // Воскресенье
    if (today === 'Воскресенье') {

        await bot.sendMessage(
            chatId,
            '😴 Сегодня воскресенье.\n\n' +
            'Пар нет.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📆 Расписание на неделю',
                                callback_data:
                                    `week_${groupId}`
                            }
                        ],
                        [
                            {
                                text: '⬅️ Назад',
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

// ==========================================
// РАСПИСАНИЕ НА НЕДЕЛЮ
// ==========================================

async function showWeek(
    chatId,
    groupId
) {

    try {

        const { data: group, error: groupError } =
            await supabase
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();

        if (groupError || !group) {

            await bot.sendMessage(
                chatId,
                '❌ Группа не найдена.'
            );

            return;
        }

        const schedule =
            await getSchedule(groupId);

        let message =
            `📚 *Расписание группы ${group.name}*\n\n`;

        let hasLessons = false;

        weekDays.forEach(day => {

            const daySchedule =
                schedule.filter(row => {

                    const rowDay =
                        dayNames[
                            String(row.day_of_week)
                        ] ||
                        String(row.day_of_week);

                    return rowDay === day;
                });

            if (daySchedule.length === 0) {
                return;
            }

            hasLessons = true;

            daySchedule.sort((a, b) =>
                Number(a.lesson_number) -
                Number(b.lesson_number)
            );

            message +=
                `\n📅 *${day}*\n`;

            message +=
                '━━━━━━━━━━━━━━\n';

            daySchedule.forEach(lesson => {

                message +=
                    formatLesson(
                        lesson,
                        day
                    );

                message += '\n';
            });

        });

        if (!hasLessons) {

            message +=
                '❌ Расписание отсутствует.';
        }

        await bot.sendMessage(
            chatId,
            message,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '⬅️ Назад',
                                callback_data:
                                    `group_${groupId}`
                            }
                        ],
                        [
                            {
                                text: '🏠 Главное меню',
                                callback_data: 'home'
                            }
                        ]
                    ]
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ Ошибка недели:',
            error
        );

        await bot.sendMessage(
            chatId,
            '❌ Ошибка при загрузке недели.'
        );
    }
}

// ==========================================
// /START
// ==========================================

bot.onText(
    /^\/(start|groups)$/,
    async (msg) => {

        await showGroups(
            msg.chat.id
        );

    }
);

// ==========================================
// CALLBACK
// ==========================================

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

        // ======================================
        // ГЛАВНОЕ МЕНЮ
        // ======================================

        if (data === 'home') {

            await showGroups(chatId);

            return;
        }

        // ======================================
        // ВЫБОР ГРУППЫ
        // ======================================

        if (data.startsWith('group_')) {

            const groupId =
                data.substring(6);

            await showGroupMenu(
                chatId,
                groupId
            );

            return;
        }

        // ======================================
        // СЕГОДНЯ
        // ======================================

        if (data.startsWith('today_')) {

            const groupId =
                data.substring(6);

            await showToday(
                chatId,
                groupId
            );

            return;
        }

        // ======================================
        // НЕДЕЛЯ
        // ======================================

        if (data.startsWith('week_')) {

            const groupId =
                data.substring(5);

            await showWeek(
                chatId,
                groupId
            );

            return;
        }

        // ======================================
        // КОНКРЕТНЫЙ ДЕНЬ
        // ======================================

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

// ==========================================
// ОШИБКИ TELEGRAM
// ==========================================

bot.on(
    'polling_error',
    (error) => {

        console.error(
            '❌ Telegram polling error:',
            error.message
        );

    }
);

// ==========================================
// GLOBAL ERRORS
// ==========================================

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
