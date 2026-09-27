const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ==============================
// SUPABASE
// ==============================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ==============================
// TELEGRAM
// ==============================

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не найден');
    process.exit(1);
}

const bot = new TelegramBot(token, {
    polling: true
});

console.log('✅ Бот запущен');

// ==============================
// ДНИ НЕДЕЛИ
// ==============================

const days = {
    'Понедельник': 'Понедельник',
    'Вторник': 'Вторник',
    'Среда': 'Среда',
    'Четверг': 'Четверг',
    'Пятница': 'Пятница',
    'Суббота': 'Суббота',
    'Воскресенье': 'Воскресенье',

    '1': 'Понедельник',
    '2': 'Вторник',
    '3': 'Среда',
    '4': 'Четверг',
    '5': 'Пятница',
    '6': 'Суббота',
    '7': 'Воскресенье'
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

// ==============================
// ГЛАВНОЕ МЕНЮ
// ==============================

async function showGroups(chatId) {

    try {

        const { data: groups, error } = await supabase
            .from('groups')
            .select('id, name')
            .order('name');

        if (error) {
            console.error('❌ Ошибка groups:', error.message);

            await bot.sendMessage(
                chatId,
                '❌ Не удалось получить список групп.'
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

        console.error('❌ Ошибка showGroups:', error);

        await bot.sendMessage(
            chatId,
            '❌ Произошла ошибка.'
        );
    }
}

// ==============================
// /START
// ==============================

bot.onText(/^\/(start|groups)$/, async (msg) => {

    await showGroups(msg.chat.id);

});

// ==============================
// CALLBACK
// ==============================

bot.on('callback_query', async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    // Убираем индикатор загрузки Telegram
    await bot.answerCallbackQuery(query.id);

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

                console.error('❌ Ошибка группы:', groupError);

                await bot.sendMessage(
                    chatId,
                    '❌ Группа не найдена.'
                );

                return;
            }

            // Получаем расписание этой группы
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

            // Если расписания действительно нет
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

            // Уникальные дни
            const uniqueDays = [
                ...new Set(
                    schedule.map(row => {
                        return days[String(row.day_of_week)]
                            || String(row.day_of_week);
                    })
                )
            ];

            // Сортировка дней
            uniqueDays.sort((a, b) => {

                return (
                    (dayOrder[a] || 99) -
                    (dayOrder[b] || 99)
                );

            });

            // Кнопки дней
            const keyboard = uniqueDays.map(day => [

                {
                    text: `📅 ${day}`,
                    callback_data: `day_${groupId}_${day}`
                }

            ]);

            keyboard.push([
                {
                    text: '🏠 Главное меню',
                    callback_data: 'home'
                }
            ]);

            await bot.sendMessage(
                chatId,
                `📚 *Группа: ${group.name}*\n\n📅 *Выберите день:*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

        } catch (error) {

            console.error('❌ Ошибка выбора группы:', error);

            await bot.sendMessage(
                chatId,
                '❌ Произошла ошибка при загрузке группы.'
            );
        }

        return;
    }

    // ==========================================
    // ВЫБОР ДНЯ
    // ==========================================

    if (data.startsWith('day_')) {

        const separator = data.indexOf('_', 4);

        const groupId = data.substring(4, separator);
        const selectedDay = data.substring(separator + 1);

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

                await bot.sendMessage(
                    chatId,
                    '❌ Группа не найдена.'
                );

                return;
            }

            // Получаем ВСЁ расписание группы
            const {
                data: allSchedule,
                error: scheduleError
            } = await supabase
                .from('schedule')
                .select('*')
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

            // Фильтруем выбранный день
            const schedule = allSchedule.filter(row => {

                const rowDay =
                    days[String(row.day_of_week)]
                    || String(row.day_of_week);

                return rowDay === selectedDay;
            });

            // Сортируем по номеру пары
            schedule.sort((a, b) => {

                return Number(a.lesson_number) -
                       Number(b.lesson_number);

            });

            // ==================================
            // НЕТ ПАР
            // ==================================

            if (schedule.length === 0) {

                await bot.sendMessage(
                    chatId,
                    `📚 *${group.name}*\n📅 *${selectedDay}*\n\n❌ В этот день пар нет.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '⬅️ Другой день',
                                        callback_data: `group_${groupId}`
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

            // ==================================
            // ФОРМИРУЕМ РАСПИСАНИЕ
            // ==================================

            let message =
                `📚 *${group.name}*\n` +
                `📅 *${selectedDay}*\n\n`;

            schedule.forEach((lesson) => {

                message += '━━━━━━━━━━━━━━\n';

                message +=
                    `🔢 *Пара №${lesson.lesson_number}*\n`;

                if (lesson.subject) {

                    message +=
                        `📖 Предмет: ${lesson.subject}\n`;
                }

                if (lesson.teacher) {

                    message +=
                        `👨‍🏫 Преподаватель: ${lesson.teacher}\n`;
                }

                if (lesson.classroom) {

                    message +=
                        `🚪 Аудитория: ${lesson.classroom}\n`;
                }

                message += '\n';
            });

            message += '━━━━━━━━━━━━━━';

            // Отправляем
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
                                    callback_data: `group_${groupId}`
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

// ==============================
// TELEGRAM ERRORS
// ==============================

bot.on('polling_error', (error) => {

    console.error(
        '❌ Telegram polling error:',
        error.message
    );

});

// ==============================
// GLOBAL ERRORS
// ==============================

process.on('unhandledRejection', (error) => {

    console.error(
        '❌ Unhandled rejection:',
        error
    );

});

process.on('uncaughtException', (error) => {

    console.error(
        '❌ Uncaught exception:',
        error
    );

});
