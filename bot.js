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
// TELEGRAM BOT
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
// ДНИ НЕДЕЛИ
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
// ВРЕМЯ ОБЫЧНЫХ ПАР
// ВТОРНИК - СУББОТА
// ==========================================

const normalLessonTimes = {
    1: '08:30–10:00',
    2: '10:10–11:40',
    3: '12:20–13:50',
    4: '14:00–15:30',
    5: '15:40–17:10'
};

// ==========================================
// ВРЕМЯ ПОНЕДЕЛЬНИКА
// С КУРАТОРСКИМ ЧАСОМ
//
// Кураторский час НЕ показываем.
// Поэтому показываем только реальные пары.
// ==========================================

const mondayLessonTimes = {
    1: '08:30–09:50',
    2: '10:40–12:00',
    3: '12:40–14:00',
    4: '14:10–15:30',
    5: '15:40–17:00'
};

// ==========================================
// ПОЛУЧИТЬ ВРЕМЯ ПАРЫ
// ==========================================

function getLessonTime(day, lessonNumber) {

    const number = Number(lessonNumber);

    if (day === 'Понедельник') {
        return mondayLessonTimes[number] || 'Время не указано';
    }

    return normalLessonTimes[number] || 'Время не указано';
}

// ==========================================
// ГЛАВНОЕ МЕНЮ / СПИСОК ГРУПП
// ==========================================

async function showGroups(chatId) {

    try {

        const { data: groups, error } = await supabase
            .from('groups')
            .select('id, name')
            .order('name');

        if (error) {

            console.error(
                '❌ Ошибка получения групп:',
                error.message
            );

            await bot.sendMessage(
                chatId,
                '❌ Не удалось загрузить список групп.'
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

        console.error(
            '❌ Ошибка showGroups:',
            error
        );

        await bot.sendMessage(
            chatId,
            '❌ Произошла ошибка.'
        );
    }
}

// ==========================================
// /START
// ==========================================

bot.onText(/^\/(start|groups)$/, async (msg) => {

    await showGroups(msg.chat.id);

});

// ==========================================
// CALLBACK-КНОПКИ
// ==========================================

bot.on('callback_query', async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    // Убираем "часики" после нажатия
    try {
        await bot.answerCallbackQuery(query.id);
    } catch (error) {
        console.error(
            'Callback error:',
            error.message
        );
    }

    // ==========================================
    // ГЛАВНОЕ МЕНЮ
    // ==========================================

    if (data === 'home') {

        await showGroups(chatId);

        return;
    }

    // ==========================================
    // ВЫБОР ГРУППЫ
    // ==========================================

    if (data.startsWith('group_')) {

        const groupId = data.substring(6);

        try {

            // Получаем группу
            const {
                data: group,
                error: groupError
            } = await supabase
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {

                console.error(
                    '❌ Группа не найдена:',
                    groupError
                );

                await bot.sendMessage(
                    chatId,
                    '❌ Группа не найдена.'
                );

                return;
            }

            // Получаем дни, в которые есть пары
            const {
                data: schedule,
                error: scheduleError
            } = await supabase
                .from('schedule')
                .select('day_of_week')
                .eq('group_id', groupId);

            if (scheduleError) {

                console.error(
                    '❌ Ошибка schedule:',
                    scheduleError.message
                );

                await bot.sendMessage(
                    chatId,
                    '❌ Не удалось загрузить расписание.'
                );

                return;
            }

            // Если расписания нет
            if (!schedule || schedule.length === 0) {

                await bot.sendMessage(
                    chatId,
                    `📚 *${group.name}*\n\n❌ Расписание пока отсутствует.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
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

            // ==========================================
            // УНИКАЛЬНЫЕ ДНИ
            // ==========================================

            const uniqueDays = [
                ...new Set(

                    schedule.map(row => {

                        return (
                            dayNames[String(row.day_of_week)]
                            || String(row.day_of_week)
                        );

                    })

                )
            ];

            // ==========================================
            // СОРТИРОВКА ДНЕЙ
            // ==========================================

            uniqueDays.sort((a, b) => {

                return (
                    (dayOrder[a] || 99) -
                    (dayOrder[b] || 99)
                );

            });

            // ==========================================
            // КНОПКИ ДНЕЙ
            // ==========================================

            const keyboard = uniqueDays.map(day => [

                {
                    text: `📅 ${day}`,
                    callback_data:
                        `day_${groupId}_${day}`
                }

            ]);

            keyboard.push([
                {
                    text: '🏠 Главное меню',
                    callback_data: 'home'
                }
            ]);

            // ==========================================
            // ПОКАЗЫВАЕМ ДНИ
            // ==========================================

            await bot.sendMessage(
                chatId,

                `📚 *Группа: ${group.name}*\n\n` +
                `📅 *Выберите день:*`,

                {
                    parse_mode: 'Markdown',

                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

        } catch (error) {

            console.error(
                '❌ Ошибка выбора группы:',
                error
            );

            await bot.sendMessage(
                chatId,
                '❌ Ошибка при загрузке группы.'
            );
        }

        return;
    }

    // ==========================================
    // ВЫБОР ДНЯ
    // ==========================================

    if (data.startsWith('day_')) {

        const value = data.substring(4);

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

        try {

            // ==========================================
            // ПОЛУЧАЕМ ГРУППУ
            // ==========================================

            const {
                data: group,
                error: groupError
            } = await supabase
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

            // ==========================================
            // ПОЛУЧАЕМ РАСПИСАНИЕ
            // ==========================================

            const {
                data: allSchedule,
                error: scheduleError
            } = await supabase
                .from('schedule')
                .select('*')
                .eq('group_id', groupId);

            if (scheduleError) {

                console.error(
                    '❌ Ошибка расписания:',
                    scheduleError.message
                );

                await bot.sendMessage(
                    chatId,
                    '❌ Не удалось загрузить расписание.'
                );

                return;
            }

            // ==========================================
            // ОСТАВЛЯЕМ ТОЛЬКО ВЫБРАННЫЙ ДЕНЬ
            // ==========================================

            const schedule =
                (allSchedule || []).filter(row => {

                    const rowDay =
                        dayNames[
                            String(row.day_of_week)
                        ] ||
                        String(row.day_of_week);

                    return rowDay === selectedDay;

                });

            // ==========================================
            // СОРТИРОВКА ПО НОМЕРУ ПАРЫ
            // ==========================================

            schedule.sort((a, b) => {

                return (
                    Number(a.lesson_number) -
                    Number(b.lesson_number)
                );

            });

            // ==========================================
            // ЕСЛИ ПАР НЕТ
            // ==========================================

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

                return;
            }

            // ==========================================
            // ФОРМИРУЕМ РАСПИСАНИЕ
            // ==========================================

            let message =

                `📚 *${group.name}*\n` +
                `📅 *${selectedDay}*\n\n`;

            schedule.forEach((lesson) => {

                const lessonNumber =
                    Number(lesson.lesson_number);

                const lessonTime =
                    getLessonTime(
                        selectedDay,
                        lessonNumber
                    );

                // Разделитель
                message +=
                    '━━━━━━━━━━━━━━\n';

                // Номер + время
                message +=
                    `🔢 *${lessonNumber} пара*` +
                    ` — ${lessonTime}\n`;

                // Предмет
                if (lesson.subject) {

                    message +=
                        `📖 ${lesson.subject}\n`;
                }

                // Преподаватель
                if (lesson.teacher) {

                    message +=
                        `👨‍🏫 ${lesson.teacher}\n`;
                }

                // Кабинет
                if (lesson.classroom) {

                    message +=
                        `🚪 Кабинет: ${lesson.classroom}\n`;
                }

                message += '\n';
            });

            message +=
                '━━━━━━━━━━━━━━';

            // ==========================================
            // КНОПКИ ПОСЛЕ РАСПИСАНИЯ
            // ==========================================

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
                '❌ Ошибка выбора дня:',
                error
            );

            await bot.sendMessage(
                chatId,
                '❌ Ошибка при загрузке расписания.'
            );
        }

        return;
    }

});

// ==========================================
// TELEGRAM POLLING ERROR
// ==========================================

bot.on('polling_error', (error) => {

    console.error(
        '❌ Telegram polling error:',
        error.message
    );

});

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
